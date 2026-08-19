import { describe, expect, it } from 'vitest';
import { Rail12306Provider } from '../src/providers/rail12306.js';

const live = process.env.RUN_LIVE_12306 === '1';
const integration = live ? describe : describe.skip;

integration('official 12306 public integration', () => {
  const provider = new Rail12306Provider();

  it('retrieves official station metadata and resolves the Shanghai–Hangzhou stations', async () => {
    await expect(provider.searchStations('上海虹桥')).resolves.toContainEqual(
      expect.objectContaining({ name: '上海虹桥', code: 'AOH' }),
    );
    await expect(provider.searchStations('杭州东')).resolves.toContainEqual(
      expect.objectContaining({ name: '杭州东', code: 'HGH' }),
    );
  }, 15_000);

  it('advertises only capabilities backed by verified public unauthenticated routes', () => {
    expect(provider.capabilities).toEqual({
      stationSearch: true,
      timetable: false,
      trainStops: false,
      fares: false,
      availability: false,
    });
  });

  it('returns a normalized capability error without querying an unsupported route', async () => {
    await expect(
      provider.searchTrains({ from: '上海虹桥', to: '杭州东', date: '2026-08-25' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_CAPABILITY_UNAVAILABLE' });
  });
});
