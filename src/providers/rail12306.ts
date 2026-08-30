import { RailError } from '../errors.js';
import type { Fare, SeatAvailability, SeatOffer } from '../domain/seat.js';
import type { Station } from '../domain/station.js';
import type { TrainDetails, TrainJourney, TrainStop } from '../domain/train.js';
import { assertQueryableTravelDate, assertTravelDate } from '../utils/date.js';
import { normalizeAvailability, normalizeSeatClass, parseFare } from '../utils/seat.js';
import type {
  AvailabilityInput,
  RailProvider,
  RailProviderCapabilities,
  SearchTrainsInput,
  TrainDetailsInput,
} from './types.js';

const OTN_BASE = 'https://kyfw.12306.cn/otn';
const STATIONS_URL = `${OTN_BASE}/resources/js/framework/station_name.js`;
const SESSION_INIT_URL = `${OTN_BASE}/leftTicket/init?linktypeid=dc`;
const TRAIN_SEARCH_URL = 'https://search.12306.cn/search/v1/train/search';
const TRAIN_STOPS_URL = `${OTN_BASE}/czxx/queryByTrainNo`;
const SESSION_TTL_MS = 10 * 60 * 1000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; china-rail-mcp/0.1; +https://github.com/TakeruF/china-rail-mcp)';
const cache = new Map<string, { expires: number; value: Station[] }>();

interface AnonymousSession {
  cookieHeader: string;
  expires: number;
}

interface TicketPayload {
  status?: boolean;
  httpstatus?: number;
  c_url?: string;
  messages?: unknown;
  data?: { result?: unknown[]; map?: Record<string, string> };
}

interface TrainSearchPayload {
  status?: boolean;
  data?: Array<{
    date?: string;
    station_train_code?: string;
    train_no?: string;
  }>;
}

interface StopPayload {
  status?: boolean;
  data?: { data?: unknown[] };
}

const seatFields: Array<{ index: number; label: string; fareCodes: string[] }> = [
  { index: 32, label: '商务座', fareCodes: ['9'] },
  { index: 25, label: '特等座', fareCodes: ['P'] },
  { index: 31, label: '一等座', fareCodes: ['M'] },
  { index: 30, label: '二等座', fareCodes: ['O'] },
  { index: 21, label: '高级软卧', fareCodes: ['6'] },
  { index: 23, label: '软卧', fareCodes: ['4'] },
  { index: 33, label: '动卧', fareCodes: ['F'] },
  { index: 28, label: '硬卧', fareCodes: ['3', 'J'] },
  { index: 24, label: '软座', fareCodes: ['2'] },
  { index: 29, label: '硬座', fareCodes: ['1'] },
  { index: 26, label: '无座', fareCodes: ['W'] },
];

/**
 * Read-only official 12306 provider.
 *
 * User/account cookies are never accepted. The provider obtains short-lived,
 * anonymous session cookies from the official query page, keeps them only in
 * process memory, and refreshes them once when the session is rejected.
 */
export class Rail12306Provider implements RailProvider {
  readonly capabilities: RailProviderCapabilities = {
    stationSearch: true,
    timetable: true,
    trainStops: true,
    fares: true,
    availability: true,
  };

  private session: AnonymousSession | undefined;
  private sessionInit: Promise<AnonymousSession> | undefined;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async searchStations(query: string): Promise<Station[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const stations = await this.stations();
    return stations.filter((station) =>
      [station.name, station.city, station.code, station.pinyin ?? ''].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }

  async searchTrains(input: SearchTrainsInput): Promise<TrainJourney[]> {
    assertQueryableTravelDate(input.date, this.now());
    const [from] = await this.resolveExact(input.from);
    const [to] = await this.resolveExact(input.to);
    if (!from || !to)
      throw new RailError('STATION_NOT_FOUND', 'Could not resolve the requested stations.');

    const payload = await this.ticketQuery(from.code, to.code, input.date);
    return parseTrainResults(payload, { fromCode: from.code, toCode: to.code });
  }

  async getTrainDetails(input: TrainDetailsInput): Promise<TrainDetails> {
    assertTravelDate(input.date);
    const searchUrl = new URL(TRAIN_SEARCH_URL);
    searchUrl.search = new URLSearchParams({
      keyword: input.trainNumber,
      date: input.date.replaceAll('-', ''),
    }).toString();
    const searchPayload = await this.requestJson<TrainSearchPayload>(searchUrl, {
      headers: { Referer: 'https://www.12306.cn/' },
    });
    const exact = searchPayload.data?.find(
      (train) =>
        train.station_train_code?.toUpperCase() === input.trainNumber.toUpperCase() &&
        train.date === input.date.replaceAll('-', '') &&
        train.train_no,
    );
    if (!exact?.train_no)
      throw new RailError(
        'JOURNEY_NOT_FOUND',
        `No official train exactly matches ${input.trainNumber} on ${input.date}.`,
      );

    const stopsUrl = new URL(TRAIN_STOPS_URL);
    stopsUrl.search = new URLSearchParams({
      train_no: exact.train_no,
      from_station_telecode: 'BBB',
      to_station_telecode: 'BBB',
      depart_date: input.date,
    }).toString();
    const stopPayload = await this.requestJson<StopPayload>(stopsUrl, {
      headers: { Referer: `${OTN_BASE}/queryTrainInfo/init` },
    });
    return parseTrainStops(stopPayload, input.trainNumber, input.date);
  }

  async getAvailability(input: AvailabilityInput): Promise<SeatAvailability> {
    const journeys = await this.searchTrains(input);
    const journey = journeys.find(
      (candidate) => candidate.trainNumber.toUpperCase() === input.trainNumber.toUpperCase(),
    );
    if (!journey)
      throw new RailError(
        'JOURNEY_NOT_FOUND',
        `${input.trainNumber} was not returned for the requested stations and date.`,
      );
    const seats: SeatAvailability['seats'] = {};
    for (const offer of journey.seatClasses) {
      if (offer.availability) seats[offer.seatClass] = offer.availability;
    }
    return { retrievedAt: journey.retrievedAt, seats };
  }

  private async resolveExact(value: string): Promise<Station[]> {
    const candidates = await this.searchStations(value);
    const matches = candidates.filter(
      (station) => station.name === value || station.code.toLowerCase() === value.toLowerCase(),
    );
    if (matches.length === 0)
      throw new RailError(
        'STATION_NOT_FOUND',
        `No station exactly matches ${value}. Use search_stations first.`,
      );
    const cityMatches = candidates.filter((station) => station.city === value);
    if (matches.length > 1 || cityMatches.length > 1)
      throw new RailError(
        'AMBIGUOUS_STATION',
        `Multiple stations match ${value}. Resolve a station first.`,
        (cityMatches.length > 1 ? cityMatches : matches).map((station) => station.name),
      );
    return matches;
  }

  private async stations(): Promise<Station[]> {
    const hit = cache.get('stations');
    if (hit && hit.expires > Date.now()) return hit.value;
    const response = await this.request(STATIONS_URL);
    const text = await response.text();
    const stations = parseStationScript(text);
    cache.set('stations', { value: stations, expires: Date.now() + 24 * 60 * 60 * 1000 });
    return stations;
  }

  private async ticketQuery(
    fromCode: string,
    toCode: string,
    date: string,
  ): Promise<TicketPayload> {
    for (let sessionAttempt = 0; sessionAttempt < 2; sessionAttempt++) {
      const session = await this.anonymousSession(sessionAttempt > 0);
      let endpoint = 'leftTicket/queryG';
      for (let endpointAttempt = 0; endpointAttempt < 2; endpointAttempt++) {
        const url = new URL(`${OTN_BASE}/${endpoint}`);
        url.search = new URLSearchParams({
          'leftTicketDTO.train_date': date,
          'leftTicketDTO.from_station': fromCode,
          'leftTicketDTO.to_station': toCode,
          purpose_codes: 'ADULT',
        }).toString();
        const response = await this.request(
          url,
          {
            headers: {
              Accept: 'application/json',
              Cookie: session.cookieHeader,
              Referer: SESSION_INIT_URL,
            },
          },
          true,
        );
        if (response.status === 302) break;
        const payload = await readJson<TicketPayload>(response, '12306 ticket query');
        if (payload.status === true && Array.isArray(payload.data?.result)) return payload;
        const alternate = endpointAttempt === 0 ? allowedTicketEndpoint(payload.c_url) : undefined;
        if (alternate) {
          endpoint = alternate;
          continue;
        }
        throw new RailError(
          'UPSTREAM_TEMPORARILY_UNAVAILABLE',
          '12306 did not return ticket data for this query.',
        );
      }
      this.session = undefined;
    }
    throw new RailError(
      'UPSTREAM_QUERY_REJECTED',
      '12306 redirected two anonymous ticket queries to its error page. Try again later.',
    );
  }

  private async anonymousSession(forceRefresh = false): Promise<AnonymousSession> {
    if (forceRefresh) this.session = undefined;
    if (this.session && this.session.expires > Date.now()) return this.session;
    if (this.sessionInit) return this.sessionInit;

    const pending = this.createAnonymousSession()
      .then((session) => {
        this.session = session;
        return session;
      })
      .finally(() => {
        if (this.sessionInit === pending) this.sessionInit = undefined;
      });
    this.sessionInit = pending;
    return pending;
  }

  private async createAnonymousSession(): Promise<AnonymousSession> {
    const response = await this.request(SESSION_INIT_URL, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    const cookieHeader = anonymousCookieHeader(response.headers.getSetCookie());
    if (!cookieHeader)
      throw new RailError(
        'UPSTREAM_RESPONSE_CHANGED',
        '12306 did not issue an anonymous query session.',
      );
    return { cookieHeader, expires: Date.now() + SESSION_TTL_MS };
  }

  private async requestJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
    return readJson<T>(await this.request(input, init), '12306');
  }

  private async request(
    input: RequestInfo | URL,
    init: RequestInit = {},
    acceptRedirect = false,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const headers = new Headers({
          Accept: 'application/json, text/javascript',
          'User-Agent': USER_AGENT,
        });
        new Headers(init.headers).forEach((value, name) => headers.set(name, value));
        const response = await this.fetcher(input, {
          ...init,
          signal: AbortSignal.timeout(10_000),
          redirect: 'manual',
          headers,
        });
        if (response.status === 429)
          throw new RailError(
            'RATE_LIMITED',
            '12306 rate-limited this request. Wait before trying again.',
          );
        if (response.status >= 500 && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        if (response.status === 302 && acceptRedirect) return response;
        if (!response.ok)
          throw new RailError(
            'UPSTREAM_TEMPORARILY_UNAVAILABLE',
            `12306 returned HTTP ${response.status}.`,
          );
        return response;
      } catch (error) {
        if (error instanceof RailError) throw error;
        lastError = error;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (lastError instanceof DOMException && lastError.name === 'TimeoutError')
      throw new RailError('NETWORK_TIMEOUT', '12306 did not respond within 10 seconds.');
    throw new RailError(
      'UPSTREAM_TEMPORARILY_UNAVAILABLE',
      'Could not reach the official 12306 public service.',
    );
  }
}

function anonymousCookieHeader(setCookies: string[]): string {
  return setCookies
    .flatMap((setCookie) => {
      const pair = setCookie.split(';', 1)[0]?.trim();
      if (!pair) return [];
      const separator = pair.indexOf('=');
      if (separator < 1) return [];
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n;]/.test(value)) return [];
      return [`${name}=${value}`];
    })
    .join('; ');
}

function allowedTicketEndpoint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/^\/?otn\//, '');
  return /^leftTicket\/query[A-Z]$/.test(normalized) ? normalized : undefined;
}

async function readJson<T>(response: Response, source: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new RailError('UPSTREAM_RESPONSE_CHANGED', `${source} returned a non-JSON response.`);
  }
}

export function parseStationScript(script: string): Station[] {
  const match = /station_names\s*=\s*'([^']+)'/.exec(script);
  if (!match?.[1])
    throw new RailError(
      'UPSTREAM_RESPONSE_CHANGED',
      'Could not find station_names in the 12306 station script.',
    );
  return match[1]
    .split('@')
    .filter(Boolean)
    .map((row) => {
      const fields = row.split('|');
      if (fields.length < 6 || !fields[1] || !fields[2])
        throw new RailError('UPSTREAM_RESPONSE_CHANGED', 'Malformed 12306 station record.');
      return {
        name: fields[1],
        code: fields[2],
        city: fields[7] || fields[1],
        ...(fields[3] ? { pinyin: fields[3] } : {}),
      };
    });
}

export function parseTrainResults(
  payload: unknown,
  exact?: { fromCode: string; toCode: string },
): TrainJourney[] {
  const root = payload as TicketPayload;
  if (!Array.isArray(root.data?.result))
    throw new RailError(
      'UPSTREAM_RESPONSE_CHANGED',
      '12306 timetable response did not contain data.result.',
    );
  const retrievedAt = new Date().toISOString();
  return root.data.result.flatMap((row) => {
    if (typeof row !== 'string')
      throw new RailError('UPSTREAM_RESPONSE_CHANGED', '12306 timetable row was not a string.');
    const fields = row.split('|');
    if (
      fields.length < 33 ||
      !fields[3] ||
      !fields[4] ||
      !fields[5] ||
      !fields[6] ||
      !fields[7] ||
      !fields[8] ||
      !fields[9] ||
      !fields[10]
    )
      throw new RailError(
        'UPSTREAM_RESPONSE_CHANGED',
        '12306 timetable row is missing required fields.',
      );
    if (exact && (fields[6] !== exact.fromCode || fields[7] !== exact.toCode)) return [];

    const compactFares = parseCompactFares(fields[39] ?? '');
    const offers: SeatOffer[] = seatFields.flatMap(({ index, label, fareCodes }) => {
      const upstreamValue = fields[index];
      const fare = fareCodes.flatMap((code) =>
        compactFares.get(code) ? [compactFares.get(code)!] : [],
      )[0];
      if (!upstreamValue && !fare) return [];
      return [
        {
          seatClass: normalizeSeatClass(label),
          upstreamLabel: label,
          ...(fare ? { fare } : {}),
          ...(upstreamValue ? { availability: normalizeAvailability(upstreamValue) } : {}),
        },
      ];
    });
    const name = (code: string) => root.data?.map?.[code] ?? code;
    return [
      {
        trainNumber: fields[3],
        originStation: name(fields[4]),
        departureStation: name(fields[6]),
        destinationStation: name(fields[5]),
        arrivalStation: name(fields[7]),
        departureTime: fields[8],
        arrivalTime: fields[9],
        durationMinutes: parseDurationStrict(fields[10]),
        trainType: fields[3].charAt(0),
        seatClasses: offers,
        retrievedAt,
      },
    ];
  });
}

export function parseCompactFares(value: string): Map<string, Fare> {
  const fares = new Map<string, Fare>();
  for (let offset = 0; offset + 10 <= value.length; offset += 10) {
    const chunk = value.slice(offset, offset + 10);
    const match = /^([0-9A-Z])(\d{5})\d{4}$/.exec(chunk);
    if (!match?.[1] || !match[2]) continue;
    fares.set(match[1], { amount: Number(match[2]) / 10, currency: 'CNY' });
  }
  return fares;
}

export function parseTrainStops(payload: unknown, trainNumber: string, date: string): TrainDetails {
  const root = payload as StopPayload;
  if (!Array.isArray(root.data?.data))
    throw new RailError(
      'UPSTREAM_RESPONSE_CHANGED',
      '12306 stop response did not contain data.data.',
    );
  const stops: TrainStop[] = root.data.data.map((value) => {
    const stop = value as {
      station_no?: string;
      station_name?: string;
      arrive_time?: string;
      start_time?: string;
      stopover_time?: string;
    };
    if (!stop.station_no || !stop.station_name)
      throw new RailError('UPSTREAM_RESPONSE_CHANGED', '12306 returned a malformed train stop.');
    return {
      order: Number(stop.station_no),
      station: stop.station_name,
      arrivalTime: normalizeStopTime(stop.arrive_time),
      departureTime: normalizeStopTime(stop.start_time),
      stopDurationMinutes: parseStopDuration(stop.stopover_time),
    };
  });
  return { trainNumber, date, stops, retrievedAt: new Date().toISOString() };
}

function normalizeStopTime(value: string | undefined): string | null {
  return value && /^\d{2}:\d{2}$/.test(value) ? value : null;
}

function parseStopDuration(value: string | undefined): number | null {
  const match = value ? /^(\d+)分钟$/.exec(value) : null;
  return match?.[1] ? Number(match[1]) : null;
}

function parseDurationStrict(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match?.[1] || !match[2])
    throw new RailError('UPSTREAM_RESPONSE_CHANGED', `Invalid 12306 duration: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export { normalizeAvailability, normalizeSeatClass, parseFare };
