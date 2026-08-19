import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RailError } from '../src/errors.js';
import { parseStationScript, parseTrainResults } from '../src/providers/rail12306.js';
import { Rail12306Provider } from '../src/providers/rail12306.js';
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
    expect(trains[0]).toMatchObject({ trainNumber: 'G1234', durationMinutes: 46 }));
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
      filterJourneys(trains, { trainTypes: ['G'], departAfter: '09:00', onlyAvailable: true }),
    ).toHaveLength(1));
});

describe('provider capabilities', () => {
  it('does not call a known unsupported upstream route', async () => {
    const provider = new Rail12306Provider(async () => {
      throw new Error('unsupported timetable route must not be fetched');
    });
    await expect(
      provider.searchTrains({ from: '上海', to: '杭州东', date: '2026-09-20' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_CAPABILITY_UNAVAILABLE' });
  });
});
