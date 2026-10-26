import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Station } from '../src/domain/station.js';
import type { TrainJourney } from '../src/domain/train.js';
import type { RailProvider } from '../src/providers/types.js';
import { createServer } from '../src/server.js';

const sourceJourneys: TrainJourney[] = Array.from({ length: 25 }, (_, index) => ({
  trainNumber: `${index % 2 === 0 ? 'G' : 'D'}${index + 1}`,
  originStation: '上海虹桥',
  departureStation: '上海虹桥',
  destinationStation: '杭州东',
  arrivalStation: '杭州东',
  departureTime: `${String(23 - Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`,
  arrivalTime: '23:59',
  durationMinutes: 30 + index,
  trainType: index % 2 === 0 ? 'G' : 'D',
  trainTypeLabel: index % 2 === 0 ? '高速动车组列车' : '动车组列车',
  seatClasses: [],
  retrievedAt: '2026-08-25T00:00:00.000Z',
}));

const stations: Station[] = [
  { name: '上海虹桥', code: 'AOH', city: '上海', pinyin: 'shanghaihongqiao' },
  { name: '上海南', code: 'SNH', city: '上海', pinyin: 'shanghainan' },
  { name: '上海', code: 'SHH', city: '上海', pinyin: 'shanghai' },
  { name: '杭州东', code: 'HGH', city: '杭州', pinyin: 'hangzhoudong' },
  { name: '杭州', code: 'HZH', city: '杭州', pinyin: 'hangzhou' },
  { name: '上海路', code: 'XXX', city: '其他城市', pinyin: 'shanghailu' },
];

const provider: RailProvider = {
  capabilities: {
    stationSearch: true,
    timetable: true,
    trainStops: true,
    fares: true,
    availability: true,
  },
  searchStations: async (query) =>
    stations.filter((station) =>
      [station.name, station.city, station.code, station.pinyin ?? ''].some((value) =>
        value.toLowerCase().includes(query.toLowerCase()),
      ),
    ),
  searchTrains: vi.fn(),
  getTrainDetails: async () => {
    throw new Error('not used');
  },
  getAvailability: async () => {
    throw new Error('not used');
  },
};

function parseTextResult(result: unknown): unknown {
  if (!result || typeof result !== 'object' || !('content' in result)) {
    throw new Error('Expected a tool result with content.');
  }
  if (!Array.isArray(result.content)) throw new Error('Expected tool content to be an array.');
  const first = result.content[0];
  if (
    !first ||
    typeof first !== 'object' ||
    !('type' in first) ||
    first.type !== 'text' ||
    !('text' in first) ||
    typeof first.text !== 'string'
  ) {
    throw new Error('Expected a text tool result.');
  }
  return JSON.parse(first.text);
}

describe('MCP tools', () => {
  let server: ReturnType<typeof createServer>;
  let client: Client;

  beforeEach(async () => {
    vi.mocked(provider.searchTrains).mockReset().mockResolvedValue(sourceJourneys);
    server = createServer(provider);
    client = new Client({ name: 'pagination-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await Promise.all([client.close(), server.close()]);
  });

  it('uses a 20-item default page for search_trains', async () => {
    const result = parseTextResult(
      await client.callTool({
        name: 'search_trains',
        arguments: { from: 'AOH', to: 'HGH', date: '2026-08-30' },
      }),
    );
    expect(result).toMatchObject({
      total: 25,
      limit: 20,
      offset: 0,
      returned: 20,
      hasMore: true,
      nextOffset: 20,
    });
  });

  it('advertises every tool as read-only', async () => {
    const result = await client.listTools();
    expect(result.tools).toHaveLength(6);
    expect(result.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(result.tools.every((tool) => tool.annotations?.destructiveHint === false)).toBe(true);
  });

  it('advertises tool-list change notifications during initialization', () => {
    expect(client.getServerCapabilities()?.tools?.listChanged).toBe(true);
  });

  it('notifies on tool registration, visibility changes, and removal', async () => {
    const notified = vi.fn();
    client.setNotificationHandler(ToolListChangedNotificationSchema, notified);
    const tool = server.registerTool('notification_probe', { inputSchema: {} }, async () => ({
      content: [],
    }));
    await vi.waitFor(() => expect(notified).toHaveBeenCalledTimes(1));
    expect(notified.mock.calls[0]?.[0]).toMatchObject({
      method: 'notifications/tools/list_changed',
    });
    expect((await client.listTools()).tools.map((item) => item.name)).toContain(
      'notification_probe',
    );

    tool.disable();
    await vi.waitFor(() => expect(notified).toHaveBeenCalledTimes(2));
    expect((await client.listTools()).tools.map((item) => item.name)).not.toContain(
      'notification_probe',
    );

    tool.enable();
    await vi.waitFor(() => expect(notified).toHaveBeenCalledTimes(3));
    expect((await client.listTools()).tools.map((item) => item.name)).toContain(
      'notification_probe',
    );

    tool.remove();
    await vi.waitFor(() => expect(notified).toHaveBeenCalledTimes(4));
    expect((await client.listTools()).tools).toHaveLength(6);
  });

  it('notifies when a tool description or input schema changes so clients can refresh it', async () => {
    const notified = vi.fn();
    client.setNotificationHandler(ToolListChangedNotificationSchema, notified);
    const tool = server.registerTool(
      'schema_probe',
      {
        description: 'Exact station lookup.',
        inputSchema: { scope: z.enum(['station']) },
      },
      async () => ({ content: [] }),
    );
    await vi.waitFor(() => expect(notified).toHaveBeenCalledTimes(1));
    await client.listTools();
    notified.mockClear();

    tool.update({
      description: 'Supports station and city scope.',
      paramsSchema: { scope: z.enum(['station', 'city']).default('station') },
    });
    await vi.waitFor(() => expect(notified).toHaveBeenCalledTimes(1));
    const updated = (await client.listTools()).tools.find((item) => item.name === 'schema_probe');
    expect(updated?.description).toBe('Supports station and city scope.');
    expect(updated?.inputSchema.properties?.scope).toMatchObject({
      enum: ['station', 'city'],
      default: 'station',
    });
  });

  it('advertises city scope and warns against restricting city requests to one station', async () => {
    const { tools } = await client.listTools();
    for (const name of ['search_trains', 'compare_trains']) {
      const tool = tools.find((tool) => tool.name === name)!;
      expect(tool.inputSchema.properties?.scope).toMatchObject({
        enum: ['station', 'city'],
        default: 'station',
      });
      expect(tool.description).toContain('do not restrict the search to a particular station');
    }
  });

  it('keeps explicit station scope exact even for a station named 上海', async () => {
    const result = parseTextResult(
      await client.callTool({
        name: 'search_trains',
        arguments: { from: '上海', to: '杭州东', scope: 'station', date: '2026-08-30' },
      }),
    );
    expect(provider.searchTrains).toHaveBeenCalledExactlyOnceWith({
      from: 'SHH',
      to: 'HGH',
      date: '2026-08-30',
    });
    expect(result).toMatchObject({
      searchScope: { from: 'station', to: 'station' },
      searchedStations: { from: [expect.objectContaining({ code: 'SHH' })] },
      excludedStations: {
        from: [
          expect.objectContaining({ code: 'AOH', reason: 'station_scope' }),
          expect.objectContaining({ code: 'SNH', reason: 'station_scope' }),
        ],
        to: [expect.objectContaining({ code: 'HZH', reason: 'station_scope' })],
      },
    });
  });

  function mockCityJourneys() {
    vi.mocked(provider.searchTrains).mockImplementation(async ({ from, to }) => {
      const journey: TrainJourney = {
        ...sourceJourneys[0]!,
        trainNumber: `${from === 'SNH' ? 'K' : 'G'}1`,
        trainType: from === 'SNH' ? 'K' : 'G',
        departureStation: stations.find((station) => station.code === from)!.name,
        arrivalStation: stations.find((station) => station.code === to)!.name,
        departureTime: from === 'SHH' ? '10:00' : '08:00',
        durationMinutes: from === 'SNH' ? 300 : 60,
      };
      return [journey, { ...journey }];
    });
  }

  it('queries all city pairs, deduplicates, sorts, then paginates without losing coverage', async () => {
    mockCityJourneys();
    const result = parseTextResult(
      await client.callTool({
        name: 'search_trains',
        arguments: {
          from: '上海',
          to: '杭州',
          scope: 'city',
          date: '2026-08-30',
          offset: 1,
          limit: 2,
        },
      }),
    ) as { journeys: TrainJourney[] };
    expect(provider.searchTrains).toHaveBeenCalledTimes(6);
    for (const from of ['AOH', 'SHH', 'SNH']) {
      for (const to of ['HGH', 'HZH']) {
        expect(provider.searchTrains).toHaveBeenCalledWith({ from, to, date: '2026-08-30' });
      }
    }
    expect(result).toMatchObject({
      searchScope: { from: 'city', to: 'city' },
      searchedStations: {
        from: stations.slice(0, 3).sort((a, b) => a.code.localeCompare(b.code)),
        to: stations.slice(3, 5),
      },
      excludedStations: { from: [], to: [] },
      total: 6,
      returned: 2,
      nextOffset: 3,
      detourHeuristic: {
        shortestDurationMinutes: 60,
        durationMultiplier: 3,
        minimumExtraMinutes: 120,
      },
    });
    expect(result.journeys.map((journey) => journey.departureStation)).toEqual([
      '上海虹桥',
      '上海南',
    ]);
    expect(result.journeys.map((journey) => journey.isPotentialDetour)).toEqual([false, true]);
  });

  it('supports a city origin and an exact station destination, including code and pinyin lookup', async () => {
    mockCityJourneys();
    for (const from of ['AOH', 'shanghai']) {
      vi.mocked(provider.searchTrains).mockClear();
      const result = parseTextResult(
        await client.callTool({
          name: 'search_trains',
          arguments: { from, to: '杭州东', fromScope: 'city', date: '2026-08-30' },
        }),
      );
      expect(provider.searchTrains).toHaveBeenCalledTimes(3);
      expect(result).toMatchObject({
        searchScope: { from: 'city', to: 'station' },
        total: 3,
        searchedStations: { to: [expect.objectContaining({ code: 'HGH' })] },
        excludedStations: { from: [], to: [expect.objectContaining({ code: 'HZH' })] },
      });
    }
  });

  it('retains the full-route duration baseline when filters and compare sorting are applied', async () => {
    mockCityJourneys();
    const result = parseTextResult(
      await client.callTool({
        name: 'compare_trains',
        arguments: {
          from: '上海',
          to: '杭州',
          scope: 'city',
          date: '2026-08-30',
          trainTypes: ['K'],
          sortBy: 'duration',
          limit: 1,
        },
      }),
    ) as { journeys: TrainJourney[] };
    expect(result).toMatchObject({ total: 2, detourHeuristic: { shortestDurationMinutes: 60 } });
    expect(result.journeys[0]).toMatchObject({
      departureStation: '上海南',
      isPotentialDetour: true,
    });
  });

  it.each([
    { shortest: 60, duration: 179, flagged: false },
    { shortest: 60, duration: 180, flagged: true },
    { shortest: 10, duration: 30, flagged: false },
    { shortest: 10, duration: 130, flagged: true },
    { shortest: 600, duration: 600, flagged: false },
  ])(
    'applies both duration thresholds ($shortest, $duration)',
    async ({ shortest, duration, flagged }) => {
      vi.mocked(provider.searchTrains).mockResolvedValue([
        { ...sourceJourneys[0]!, durationMinutes: shortest },
        { ...sourceJourneys[1]!, durationMinutes: duration },
      ]);
      const result = parseTextResult(
        await client.callTool({
          name: 'search_trains',
          arguments: { from: 'AOH', to: 'HGH', date: '2026-08-30' },
        }),
      ) as { journeys: TrainJourney[] };
      expect(
        result.journeys.find((journey) => journey.trainNumber === 'D2')?.isPotentialDetour,
      ).toBe(flagged);
    },
  );

  it('reports searched stations even when no trains are returned', async () => {
    vi.mocked(provider.searchTrains).mockResolvedValue([]);
    const result = parseTextResult(
      await client.callTool({
        name: 'search_trains',
        arguments: { from: '上海', to: '杭州', scope: 'city', date: '2026-08-30' },
      }),
    );
    expect(result).toMatchObject({
      total: 0,
      journeys: [],
      detourHeuristic: { shortestDurationMinutes: null },
      searchedStations: { from: expect.any(Array), to: expect.any(Array) },
      excludedStations: { from: [], to: [] },
    });
    expect(provider.searchTrains).toHaveBeenCalledTimes(6);
  });

  it('does not present partial city results as a successful complete search', async () => {
    vi.mocked(provider.searchTrains)
      .mockResolvedValueOnce(sourceJourneys)
      .mockRejectedValueOnce(new Error('timeout'));
    const result = await client.callTool({
      name: 'search_trains',
      arguments: { from: '上海', to: '杭州东', fromScope: 'city', date: '2026-08-30' },
    });
    expect(result).toMatchObject({ isError: true });
    expect(parseTextResult(result)).toMatchObject({ code: 'UPSTREAM_TEMPORARILY_UNAVAILABLE' });
  });

  it('rejects partial city names and invalid scope without querying trains', async () => {
    for (const args of [
      { from: '上', scope: 'city' },
      { from: '上海', scope: 'invalid' },
    ]) {
      expect(
        await client.callTool({
          name: 'search_trains',
          arguments: { ...args, to: '杭州', date: '2026-08-30' },
        }),
      ).toMatchObject({ isError: true });
    }
    expect(provider.searchTrains).not.toHaveBeenCalled();
  });

  it('filters and sorts before applying compare_trains pagination', async () => {
    const result = parseTextResult(
      await client.callTool({
        name: 'compare_trains',
        arguments: {
          from: 'AOH',
          to: 'HGH',
          date: '2026-08-30',
          trainTypes: ['G'],
          sortBy: 'duration',
          offset: 2,
          limit: 3,
        },
      }),
    ) as { total: number; journeys: TrainJourney[] };
    expect(result.total).toBe(13);
    expect(result.journeys.map((journey) => journey.trainNumber)).toEqual(['G5', 'G7', 'G9']);
  });

  it('normalizes lowercase train-type filters', async () => {
    const result = parseTextResult(
      await client.callTool({
        name: 'search_trains',
        arguments: {
          from: 'AOH',
          to: 'HGH',
          date: '2026-08-30',
          trainTypes: ['d'],
        },
      }),
    ) as { total: number; journeys: TrainJourney[] };
    expect(result.total).toBe(12);
    expect(result.journeys.every((journey) => journey.trainType === 'D')).toBe(true);
  });

  it('rejects pages larger than 50 items', async () => {
    await expect(
      client.callTool({
        name: 'search_trains',
        arguments: { from: 'AOH', to: 'HGH', date: '2026-08-30', limit: 51 },
      }),
    ).resolves.toMatchObject({ isError: true });
  });
});
