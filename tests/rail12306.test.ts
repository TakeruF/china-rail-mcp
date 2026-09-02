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
import { filterJourneys, paginateJourneys } from '../src/tools/common.js';
import {
  assertQueryableTravelDate,
  assertTravelDate,
  ticketQueryWindow,
} from '../src/utils/date.js';
import { normalizeAvailability, normalizeSeatClass, parseFare } from '../src/utils/seat.js';
import { classifyTrainNumber } from '../src/utils/train.js';
const stations = parseStationScript(readFileSync('fixtures/stations.js', 'utf8'));
const trains = parseTrainResults(JSON.parse(readFileSync('fixtures/left-ticket.json', 'utf8')));
const dTicketPayload = readFileSync('fixtures/left-ticket-d.json', 'utf8');
const dTrains = parseTrainResults(JSON.parse(dTicketPayload));
describe('12306 parsing', () => {
  it('parses station code records', () =>
    expect(stations).toContainEqual(
      expect.objectContaining({ name: '上海虹桥', code: 'AOH', city: '上海' }),
    ));
  it('rejects malformed station scripts', () =>
    expect(() => parseStationScript('nope')).toThrow(RailError));
  it('parses train rows and duration', () =>
    expect(trains[0]).toMatchObject({ trainNumber: 'G7541', durationMinutes: 59 }));
  it('parses an official D-train row and its fares and availability', () =>
    expect(dTrains[0]).toMatchObject({
      trainNumber: 'D3145',
      trainType: 'D',
      trainTypeLabel: '动车组列车',
      departureStation: '上海虹桥',
      arrivalStation: '宁波',
      durationMinutes: 156,
      seatClasses: expect.arrayContaining([
        expect.objectContaining({
          seatClass: 'first_class',
          fare: { amount: 184, currency: 'CNY' },
          availability: expect.objectContaining({ count: 9 }),
        }),
        expect.objectContaining({
          seatClass: 'second_class',
          fare: { amount: 116, currency: 'CNY' },
          availability: expect.objectContaining({ status: 'available' }),
        }),
      ]),
    }));
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
  it('keeps advanced soft sleeper and D-train sleeper distinct', () => {
    const payload = JSON.parse(dTicketPayload) as {
      data: { result: string[]; map: Record<string, string> };
    };
    const fields = payload.data.result[0]!.split('|');
    fields[21] = '有';
    fields[33] = '2';
    fields[39] = '6010000000F005000000';
    payload.data.result[0] = fields.join('|');

    expect(parseTrainResults(payload)[0]?.seatClasses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          seatClass: 'advanced_soft_sleeper',
          fare: { amount: 100, currency: 'CNY' },
        }),
        expect.objectContaining({
          seatClass: 'dynamic_sleeper',
          fare: { amount: 50, currency: 'CNY' },
          availability: expect.objectContaining({ count: 2 }),
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
  it('classifies major Chinese train prefixes and preserves unknown prefixes', () => {
    expect(['G', 'D', 'C', 'S', 'Z', 'T', 'K', 'L', 'Y'].map(classifyTrainNumber)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trainType: 'G', trainTypeLabel: '高速动车组列车' }),
        expect.objectContaining({ trainType: 'D', trainTypeLabel: '动车组列车' }),
        expect.objectContaining({ trainType: 'K', trainTypeLabel: '快速列车' }),
      ]),
    );
    expect(classifyTrainNumber('1234')).toEqual({
      trainType: 'OTHER',
      trainTypeLabel: '其他列车',
      upstreamTrainType: '1',
    });
  });
  it('normalizes seats and availability', () => {
    expect(normalizeSeatClass('二等座')).toBe('second_class');
    expect(normalizeSeatClass('高级软卧')).toBe('advanced_soft_sleeper');
    expect(normalizeSeatClass('动卧')).toBe('dynamic_sleeper');
    expect(normalizeSeatClass('软卧')).toBe('soft_sleeper');
    expect(normalizeAvailability('有').status).toBe('available');
    expect(normalizeAvailability('0')).toMatchObject({ status: 'unavailable', count: 0 });
    expect(normalizeAvailability('候补').status).toBe('waitlist');
  });
  it('parses CNY fares', () =>
    expect(parseFare('¥553.0')).toEqual({ amount: 553, currency: 'CNY' }));
  it('validates dates', () => {
    expect(() => assertTravelDate('2026-99-20')).toThrow(RailError);
    expect(() => assertTravelDate('2026-02-31')).toThrow(RailError);
    expect(() => assertTravelDate('20-09-2026')).toThrow(RailError);
  });
  it('limits ticket queries to the current 15-day 12306 window in Asia/Shanghai', () => {
    const now = new Date('2026-08-30T00:00:00+08:00');
    expect(() => assertQueryableTravelDate('2026-08-30', now)).not.toThrow();
    expect(() => assertQueryableTravelDate('2026-09-13', now)).not.toThrow();
    expect(() => assertQueryableTravelDate('2026-08-29', now)).toThrowError(
      expect.objectContaining({ code: 'DATE_OUTSIDE_QUERY_WINDOW' }),
    );
    expect(() => assertQueryableTravelDate('2026-09-14', now)).toThrowError(
      expect.objectContaining({
        code: 'DATE_OUTSIDE_TICKET_WINDOW',
        details: expect.objectContaining({
          ticketStatus: 'not_on_sale',
          expectedSalesOpenDate: '2026-08-31',
          retryFrom: '2026-08-31',
          timetableMayBeAvailable: true,
          suggestedTool: 'get_train_details',
          requiresTrainNumber: true,
        }),
      }),
    );
    expect(ticketQueryWindow('2026-09-14', now)).toMatchObject({
      today: '2026-08-30',
      lastQueryableDate: '2026-09-13',
      daysAhead: 15,
      status: 'not_on_sale',
    });
  });
});
describe('filtering', () => {
  it('filters by type, time, and availability', () =>
    expect(
      filterJourneys(trains, { trainTypes: ['G'], departAfter: '05:00', onlyAvailable: true }),
    ).toHaveLength(1));

  it('filters D trains by their normalized prefix', () =>
    expect(filterJourneys(dTrains, { trainTypes: ['d'] })).toHaveLength(1));

  it('paginates a filtered result with stable continuation metadata', () => {
    const filtered = filterJourneys(trains, { trainTypes: ['G'] });
    expect(paginateJourneys(filtered, { limit: 1, offset: 0 })).toMatchObject({
      total: filtered.length,
      limit: 1,
      offset: 0,
      returned: 1,
      hasMore: filtered.length > 1,
      nextOffset: filtered.length > 1 ? 1 : null,
      journeys: filtered.slice(0, 1),
    });
  });

  it('returns an empty terminal page when the offset exceeds the result count', () =>
    expect(paginateJourneys(trains, { limit: 20, offset: trains.length + 1 })).toMatchObject({
      total: trains.length,
      returned: 0,
      hasMore: false,
      nextOffset: null,
      journeys: [],
    }));
});

describe('provider capabilities', () => {
  const stationScript = readFileSync('fixtures/stations.js', 'utf8');
  const ticketPayload = readFileSync('fixtures/left-ticket.json', 'utf8');
  const fixedNow = () => new Date('2026-08-25T00:00:00+08:00');

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
    }, fixedNow);

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
    }, fixedNow);

    await expect(
      provider.searchTrains({ from: 'AOH', to: 'HGH', date: '2026-08-30' }),
    ).resolves.toHaveLength(1);
    expect(sessionInitializations).toBe(2);
    expect(ticketQueries).toBe(2);
  });

  it('does not mislabel two ticket-query redirects as session initialization failures', async () => {
    let sessionInitializations = 0;
    const provider = new Rail12306Provider(async (input) => {
      const url = String(input);
      if (url.includes('station_name.js')) return new Response(stationScript);
      if (url.includes('leftTicket/init')) {
        sessionInitializations++;
        return sessionResponse(`JSESSIONID=session-${sessionInitializations}; Path=/otn`);
      }
      if (url.includes('leftTicket/queryG'))
        return new Response(null, {
          status: 302,
          headers: { location: 'https://www.12306.cn/mormhweb/logFiles/error.html' },
        });
      throw new Error(`Unexpected URL: ${url}`);
    }, fixedNow);

    await expect(
      provider.searchTrains({ from: 'AOH', to: 'HGH', date: '2026-08-30' }),
    ).rejects.toMatchObject({
      code: 'UPSTREAM_QUERY_REJECTED',
      message: expect.not.stringContaining('session'),
    });
    expect(sessionInitializations).toBe(2);
  });

  it('rejects dates outside the query window before contacting 12306', async () => {
    const provider = new Rail12306Provider(
      async () => {
        throw new Error('The upstream must not be contacted');
      },
      () => new Date('2026-08-30T00:00:00+08:00'),
    );

    await expect(
      provider.searchTrains({ from: '深圳北', to: '广州南', date: '2026-09-19' }),
    ).rejects.toMatchObject({
      code: 'DATE_OUTSIDE_TICKET_WINDOW',
      details: expect.objectContaining({
        expectedSalesOpenDate: '2026-09-05',
        retryFrom: '2026-09-05',
      }),
    });
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
    }, fixedNow);

    await expect(
      provider.getTrainDetails({ trainNumber: 'G7541', date: '2026-08-30' }),
    ).resolves.toMatchObject({
      trainNumber: 'G7541',
      timetableStatus: 'published',
      bookingStatus: 'not_checked',
      availability: null,
      stops: [
        { order: 1, station: '上海虹桥', arrivalTime: null, departureTime: '05:52' },
        { order: 2, station: '杭州东', stopDurationMinutes: 2 },
      ],
    });
  });

  it('returns a published timetable before tickets enter the query window', async () => {
    const provider = new Rail12306Provider(
      async (input) => {
        const url = String(input);
        if (url.startsWith('https://search.12306.cn/'))
          return Response.json({
            status: true,
            data: [
              {
                date: '20260920',
                station_train_code: 'G1',
                train_no: '24000000G10L',
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
                  station_name: '北京南',
                  arrive_time: '----',
                  start_time: '06:30',
                  stopover_time: '----',
                },
              ],
            },
          });
        throw new Error(`Unexpected URL: ${url}`);
      },
      () => new Date('2026-09-03T00:00:00+08:00'),
    );

    await expect(
      provider.getTrainDetails({ trainNumber: 'G1', date: '2026-09-20' }),
    ).resolves.toMatchObject({
      timetableStatus: 'published',
      bookingStatus: 'not_on_sale',
      availability: null,
      expectedSalesOpenDate: '2026-09-06',
    });
  });

  it('does not mislabel an unpublished future timetable as a cancelled train', async () => {
    const provider = new Rail12306Provider(
      async (input) => {
        const url = String(input);
        if (url.startsWith('https://search.12306.cn/'))
          return Response.json({ status: true, data: [] });
        throw new Error(`Unexpected URL: ${url}`);
      },
      () => new Date('2026-09-03T00:00:00+08:00'),
    );

    await expect(
      provider.getTrainDetails({ trainNumber: 'G1', date: '2026-10-01' }),
    ).rejects.toMatchObject({
      code: 'TIMETABLE_NOT_YET_PUBLISHED',
      message: expect.stringContaining('does not mean the train is cancelled'),
      details: expect.objectContaining({
        timetableStatus: 'not_yet_published',
        ticketStatus: 'not_on_sale',
        expectedSalesOpenDate: '2026-09-17',
        retryFrom: '2026-09-17',
      }),
    });
  });

  it('does not mislabel a malformed train-search response as an unpublished timetable', async () => {
    const provider = new Rail12306Provider(
      async (input) => {
        const url = String(input);
        if (url.startsWith('https://search.12306.cn/')) return Response.json({ status: false });
        throw new Error(`Unexpected URL: ${url}`);
      },
      () => new Date('2026-09-03T00:00:00+08:00'),
    );

    await expect(
      provider.getTrainDetails({ trainNumber: 'G1', date: '2026-10-01' }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_CHANGED' });
  });

  it('supports D-train search, availability, and stop details end to end', async () => {
    const provider = new Rail12306Provider(
      async (input) => {
        const url = String(input);
        if (url.includes('station_name.js')) return new Response(stationScript);
        if (url.includes('leftTicket/init')) return sessionResponse();
        if (url.includes('leftTicket/queryG'))
          return new Response(dTicketPayload, { headers: { 'content-type': 'application/json' } });
        if (url.startsWith('https://search.12306.cn/'))
          return Response.json({
            status: true,
            data: [
              {
                date: '20260906',
                station_train_code: 'D3145',
                train_no: '5l000D314505',
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
                  start_time: '06:27',
                  stopover_time: '----',
                },
                {
                  station_no: '09',
                  station_name: '宁波',
                  arrive_time: '09:03',
                  start_time: '09:06',
                  stopover_time: '3分钟',
                },
              ],
            },
          });
        throw new Error(`Unexpected URL: ${url}`);
      },
      () => new Date('2026-09-03T00:00:00+08:00'),
    );

    await expect(
      provider.searchTrains({ from: 'AOH', to: 'NGH', date: '2026-09-06' }),
    ).resolves.toEqual([expect.objectContaining({ trainNumber: 'D3145', trainType: 'D' })]);
    await expect(
      provider.getAvailability({
        from: 'AOH',
        to: 'NGH',
        trainNumber: 'D3145',
        date: '2026-09-06',
      }),
    ).resolves.toMatchObject({
      seats: {
        first_class: { status: 'available', count: 9 },
        second_class: { status: 'available' },
      },
    });
    await expect(
      provider.getTrainDetails({ trainNumber: 'D3145', date: '2026-09-06' }),
    ).resolves.toMatchObject({
      trainNumber: 'D3145',
      stops: [
        { station: '上海虹桥', departureTime: '06:27' },
        { station: '宁波', arrivalTime: '09:03', stopDurationMinutes: 3 },
      ],
    });
  });

  it('rejects malformed stop payloads', () => {
    expect(() => parseTrainStops({}, 'G1', '2026-08-30')).toThrow(RailError);
  });
});
