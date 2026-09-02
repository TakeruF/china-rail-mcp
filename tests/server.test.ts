import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

const provider: RailProvider = {
  capabilities: {
    stationSearch: true,
    timetable: true,
    trainStops: true,
    fares: true,
    availability: true,
  },
  searchStations: async () => [],
  searchTrains: async () => sourceJourneys,
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

describe('MCP pagination', () => {
  let server: ReturnType<typeof createServer>;
  let client: Client;

  beforeEach(async () => {
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
