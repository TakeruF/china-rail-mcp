import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RailError } from '../src/errors.js';
import { Rail12306Provider } from '../src/providers/rail12306.js';
import {
  parseCompactFares,
  parseStationScript,
  parseTrainResults,
  parseTrainStops,
} from '../src/providers/rail12306.js';
import { filterJourneys } from '../src/tools/common.js';
import { assertTravelDate } from '../src/utils/date.js';
import { normalizeAvailability, normalizeSeatClass, parseFare } from '../src/utils/seat.js';
const stations = parseStationScript(readFileSync('fixtures/stations.js', 'utf8'));
const trains = parseTrainResults(JSON.parse(readFileSync('fixtures/left-ticket.json', 'utf8')));
describe('12306 parsing', () => {
  it('parses station code records', () =>
    expect(stations).toContainEqual(
      expect.objectContaining({ name: '上海虹桥', code: 'AOH', city: '上海' }),
    ));
  it('rejects malformed station scripts', () =>
    expect(() => parseStationScript('nope')).toThrow(RailError));
  it('parses train rows and duration', () =>
    expect(trains[0]).toMatchObject({ trainNumber: 'G7541', durationMinutes: 59 }));
  it('maps the live 12306 seat indexes and compact fares', () => {
    expect(trains[0]?.seatClasses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          seatClass: 'business',
          fare: { amount: 199, currency: 'CNY' },
          availability: expect.objectContaining({ count: 2 }),
        }),
        expect.objectContaining({
          seatClass: 'first_class',
          fare: { amount: 91, currency: 'CNY' },
          availability: expect.objectContaining({ status: 'available' }),
        }),
        expect.objectContaining({
          seatClass: 'second_class',
          fare: { amount: 57, currency: 'CNY' },
          availability: expect.objectContaining({ status: 'available' }),
        }),
        expect.objectContaining({
          seatClass: 'standing',
          availability: expect.objectContaining({ status: 'unavailable' }),
        }),
      ]),
    );
  });
  it('parses compact fare chunks without inventing malformed prices', () => {
    expect(parseCompactFares('9019900021M009100021O005700021').get('M')).toEqual({
      amount: 91,
      currency: 'CNY',
    });
    expect(parseCompactFares('not-a-fare')).toEqual(new Map());
  });
  it('filters city-area rows to the exact requested station codes', () => {
    expect(
      parseTrainResults(JSON.parse(readFileSync('fixtures/left-ticket.json', 'utf8')), {
        fromCode: 'AOH',
        toCode: 'HGH',
      }),
    ).toHaveLength(1);
    expect(
      parseTrainResults(JSON.parse(readFileSync('fixtures/left-ticket.json', 'utf8')), {
        fromCode: 'IMH',
        toCode: 'HZH',
      }),
    ).toHaveLength(0);
  });
  it('rejects malformed train responses', () =>
    expect(() => parseTrainResults({ data: {} })).toThrow(RailError));
});
describe('normalization', () => {
  it('normalizes seats and availability', () => {
    expect(normalizeSeatClass('二等座')).toBe('second_class');
    expect(normalizeAvailability('有').status).toBe('available');
    expect(normalizeAvailability('0')).toMatchObject({ status: 'unavailable', count: 0 });
    expect(normalizeAvailability('候补').status).toBe('waitlist');
  });
  it('parses CNY fares', () =>
    expect(parseFare('¥553.0')).toEqual({ amount: 553, currency: 'CNY' }));
  it('validates dates', () => {
    expect(() => assertTravelDate('2026-99-20')).toThrow(RailError);
    expect(() => assertTravelDate('20-09-2026')).toThrow(RailError);
  });
});
describe('filtering', () => {
  it('filters by type, time, and availability', () =>
    expect(
      filterJourneys(trains, { trainTypes: ['G'], departAfter: '05:00', onlyAvailable: true }),
    ).toHaveLength(1));
});

describe('provider capabilities', () => {
  const stationScript = readFileSync('fixtures/stations.js', 'utf8');
  const ticketPayload = readFileSync('fixtures/left-ticket.json', 'utf8');

  function sessionResponse(cookie = 'JSESSIONID=anonymous; Path=/otn; HttpOnly'): Response {
    const headers = new Headers();
    headers.append('set-cookie', cookie);
    headers.append('set-cookie', 'BIGipServerotn=load-balancer; Path=/');
    return new Response('<html></html>', { status: 200, headers });
  }

  it('uses only an in-memory official anonymous session and reuses it', async () => {
    let sessionInitializations = 0;
    let ticketQueries = 0;
    const provider = new Rail12306Provider(async (input, init) => {
      const url = String(input);
      if (url.includes('station_name.js')) return new Response(stationScript);
      if (url.includes('leftTicket/init')) {
        sessionInitializations++;
        return sessionResponse();
      }
      if (url.includes('leftTicket/queryG')) {
        ticketQueries++;
        const headers = new Headers(init?.headers);
        expect(headers.get('cookie')).toContain('JSESSIONID=anonymous');
        expect(headers.get('referer')).toContain('leftTicket/init');
        return new Response(ticketPayload, {
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const first = await provider.searchTrains({
      from: '上海虹桥',
      to: '杭州东',
      date: '2026-08-30',
    });
    const second = await provider.searchTrains({
      from: 'AOH',
      to: 'HGH',
      date: '2026-08-30',
    });
    const availability = await provider.getAvailability({
      from: 'AOH',
      to: 'HGH',
      trainNumber: 'G7541',
      date: '2026-08-30',
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(availability.seats.second_class).toMatchObject({ status: 'available' });
    expect(sessionInitializations).toBe(1);
    expect(ticketQueries).toBe(3);
  });

  it('refreshes the anonymous session once after a redirect', async () => {
    let sessionInitializations = 0;
    let ticketQueries = 0;
    const provider = new Rail12306Provider(async (input) => {
      const url = String(input);
      if (url.includes('station_name.js')) return new Response(stationScript);
      if (url.includes('leftTicket/init'))
        return sessionResponse(`JSESSIONID=session-${++sessionInitializations}; Path=/otn`);
      if (url.includes('leftTicket/queryG')) {
        ticketQueries++;
        return ticketQueries === 1
          ? new Response(null, { status: 302, headers: { location: '/error' } })
          : new Response(ticketPayload, { headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(
      provider.searchTrains({ from: 'AOH', to: 'HGH', date: '2026-08-30' }),
    ).resolves.toHaveLength(1);
    expect(sessionInitializations).toBe(2);
    expect(ticketQueries).toBe(2);
  });

  it('resolves an exact train number and parses its official stops', async () => {
    const provider = new Rail12306Provider(async (input) => {
      const url = String(input);
      if (url.startsWith('https://search.12306.cn/'))
        return Response.json({
          status: true,
          data: [
            {
              date: '20260830',
              station_train_code: 'G7541',
              train_no: '5l000G75410A',
            },
          ],
        });
      if (url.includes('czxx/queryByTrainNo'))
        return Response.json({
          status: true,
          data: {
            data: [
              {
                station_no: '01',
                station_name: '上海虹桥',
                arrive_time: '----',
                start_time: '05:52',
                stopover_time: '----',
              },
              {
                station_no: '02',
                station_name: '杭州东',
                arrive_time: '06:51',
                start_time: '06:53',
                stopover_time: '2分钟',
              },
            ],
          },
        });
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(
      provider.getTrainDetails({ trainNumber: 'G7541', date: '2026-08-30' }),
    ).resolves.toMatchObject({
      trainNumber: 'G7541',
      stops: [
        { order: 1, station: '上海虹桥', arrivalTime: null, departureTime: '05:52' },
        { order: 2, station: '杭州东', stopDurationMinutes: 2 },
      ],
    });
  });

  it('rejects malformed stop payloads', () => {
    expect(() => parseTrainStops({}, 'G1', '2026-08-30')).toThrow(RailError);
  });
});
