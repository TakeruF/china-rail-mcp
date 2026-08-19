import { RailError } from '../errors.js';
import type { SeatAvailability } from '../domain/seat.js';
import type { Station } from '../domain/station.js';
import type { TrainDetails, TrainJourney } from '../domain/train.js';
import { assertTravelDate } from '../utils/date.js';
import { normalizeAvailability, normalizeSeatClass, parseFare } from '../utils/seat.js';
import type {
  AvailabilityInput,
  RailProvider,
  RailProviderCapabilities,
  SearchTrainsInput,
  TrainDetailsInput,
} from './types.js';

const STATIONS_URL = 'https://kyfw.12306.cn/otn/resources/js/framework/station_name.js';
const cache = new Map<string, { expires: number; value: Station[] }>();

/** Unauthenticated public 12306 endpoints only. Never add cookies, login, or anti-bot workarounds. */
export class Rail12306Provider implements RailProvider {
  /**
   * Observed 2026-08-19 from an ordinary unauthenticated request. Keep false
   * until a route is verified without cookies, CAPTCHA, or other workarounds.
   */
  readonly capabilities: RailProviderCapabilities = {
    stationSearch: true,
    timetable: false,
    trainStops: false,
    fares: false,
    availability: false,
  };

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async searchStations(query: string): Promise<Station[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const stations = await this.stations();
    return stations.filter((station) =>
      [station.name, station.city, station.code, station.pinyin ?? ''].some((v) =>
        v.toLowerCase().includes(normalized),
      ),
    );
  }

  async searchTrains(input: SearchTrainsInput): Promise<TrainJourney[]> {
    assertTravelDate(input.date);
    this.assertCapability('timetable');
    throw new RailError(
      'UPSTREAM_RESPONSE_CHANGED',
      'Timetable support was enabled without an implementation.',
    );
  }

  async getTrainDetails(input: TrainDetailsInput): Promise<TrainDetails> {
    assertTravelDate(input.date);
    this.assertCapability('trainStops');
    throw new RailError(
      'UPSTREAM_RESPONSE_CHANGED',
      'Train-stop support was enabled without an implementation.',
    );
  }

  async getAvailability(input: AvailabilityInput): Promise<SeatAvailability> {
    assertTravelDate(input.date);
    this.assertCapability('availability');
    throw new RailError(
      'UPSTREAM_RESPONSE_CHANGED',
      'Availability support was enabled without an implementation.',
    );
  }

  private async resolveExact(value: string): Promise<Station[]> {
    const candidates = await this.searchStations(value);
    const matches = candidates.filter(
      (s) => s.name === value || s.code.toLowerCase() === value.toLowerCase(),
    );
    if (matches.length === 0)
      throw new RailError(
        'STATION_NOT_FOUND',
        `No station exactly matches ${value}. Use search_stations first.`,
      );
    const cityMatches = candidates.filter((s) => s.city === value);
    if (matches.length > 1 || cityMatches.length > 1)
      throw new RailError(
        'AMBIGUOUS_STATION',
        `Multiple stations match ${value}. Resolve a station first.`,
        (cityMatches.length > 1 ? cityMatches : matches).map((s) => s.name),
      );
    return matches;
  }

  private assertCapability(
    capability: Exclude<keyof RailProviderCapabilities, 'stationSearch'>,
  ): void {
    if (!this.capabilities[capability])
      throw new RailError(
        'PROVIDER_CAPABILITY_UNAVAILABLE',
        `The configured public 12306 provider does not currently expose unauthenticated ${capability}.`,
      );
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

  private async request(input: RequestInfo | URL): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetcher(input, {
          signal: AbortSignal.timeout(10_000),
          redirect: 'manual',
          headers: { Accept: 'application/json, text/javascript' },
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
        if (!response.ok && response.status !== 302)
          throw new RailError(
            'UPSTREAM_TEMPORARILY_UNAVAILABLE',
            `12306 station metadata returned HTTP ${response.status}.`,
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
      'Could not reach the public 12306 station metadata endpoint.',
    );
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
      const p = row.split('|');
      if (p.length < 6 || !p[1] || !p[2])
        throw new RailError('UPSTREAM_RESPONSE_CHANGED', 'Malformed 12306 station record.');
      return { name: p[1], code: p[2], city: p[7] || p[1], ...(p[3] ? { pinyin: p[3] } : {}) };
    });
}

export function parseTrainResults(payload: unknown): TrainJourney[] {
  const root = payload as { data?: { result?: unknown[]; map?: Record<string, string> } };
  if (!Array.isArray(root.data?.result))
    throw new RailError(
      'UPSTREAM_RESPONSE_CHANGED',
      '12306 timetable response did not contain data.result.',
    );
  const retrievedAt = new Date().toISOString();
  return root.data.result.map((row) => {
    if (typeof row !== 'string')
      throw new RailError('UPSTREAM_RESPONSE_CHANGED', '12306 timetable row was not a string.');
    const p = row.split('|');
    if (p.length < 33 || !p[3] || !p[4] || !p[5] || !p[6] || !p[7] || !p[8] || !p[9] || !p[10])
      throw new RailError(
        'UPSTREAM_RESPONSE_CHANGED',
        '12306 timetable row is missing required fields.',
      );
    const offers = [
      { i: 32, label: '一等座' },
      { i: 31, label: '二等座' },
      { i: 30, label: '商务座' },
      { i: 28, label: '无座' },
      { i: 29, label: '硬卧' },
      { i: 23, label: '软卧' },
    ].flatMap(({ i, label }) =>
      p[i]
        ? [
            {
              seatClass: normalizeSeatClass(label),
              upstreamLabel: label,
              availability: normalizeAvailability(p[i]),
            },
          ]
        : [],
    );
    const name = (code: string) => root.data?.map?.[code] ?? code;
    return {
      trainNumber: p[3],
      originStation: name(p[4]),
      departureStation: name(p[6]),
      destinationStation: name(p[5]),
      arrivalStation: name(p[7]),
      departureTime: p[8],
      arrivalTime: p[9],
      durationMinutes: parseDurationStrict(p[10]),
      trainType: p[3].charAt(0),
      seatClasses: offers,
      retrievedAt,
    };
  });
}
function parseDurationStrict(value: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new RailError('UPSTREAM_RESPONSE_CHANGED', `Invalid 12306 duration: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}
export { normalizeAvailability, normalizeSeatClass, parseFare };
