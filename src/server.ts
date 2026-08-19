import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RailProvider } from './providers/types.js';
import { journeys, toolError } from './tools/common.js';
import { timeToMinutes } from './utils/date.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD (Asia/Shanghai).');
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM.');
const filters = {
  departAfter: time.optional(),
  departBefore: time.optional(),
  trainTypes: z.array(z.string().min(1).max(1)).optional(),
  seatClass: z
    .enum([
      'business',
      'premium_first',
      'first_class',
      'second_class',
      'soft_sleeper',
      'hard_sleeper',
      'soft_seat',
      'hard_seat',
      'standing',
      'other',
    ])
    .optional(),
  onlyAvailable: z.boolean().optional(),
};
const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

export function createServer(provider: RailProvider): McpServer {
  const server = new McpServer({ name: 'china-rail-mcp', version: '0.1.0' });
  server.registerTool(
    'get_provider_status',
    {
      description:
        'Return the configured provider and its currently verified unauthenticated public-data capabilities.',
      inputSchema: {},
    },
    async () => text({ provider: '12306-public', capabilities: provider.capabilities }),
  );
  server.registerTool(
    'search_stations',
    {
      description:
        'Search public Chinese railway stations. City names are not silently resolved to a specific station.',
      inputSchema: { query: z.string().min(1) },
    },
    async ({ query }) => {
      try {
        return text(await provider.searchStations(query));
      } catch (e) {
        return toolError(e);
      }
    },
  );
  server.registerTool(
    'search_trains',
    {
      description: 'Search unauthenticated public 12306 timetable data. Times are Asia/Shanghai.',
      inputSchema: { from: z.string().min(1), to: z.string().min(1), date, ...filters },
    },
    async (input) => {
      try {
        return text(await journeys(provider, input));
      } catch (e) {
        return toolError(e);
      }
    },
  );
  server.registerTool(
    'get_train_details',
    {
      description: 'Get a train stop sequence when the public provider supports it.',
      inputSchema: { trainNumber: z.string().min(1), date },
    },
    async (input) => {
      try {
        return text(await provider.getTrainDetails(input));
      } catch (e) {
        return toolError(e);
      }
    },
  );
  server.registerTool(
    'get_availability',
    {
      description:
        'Get normalized seat availability where public upstream data makes it available.',
      inputSchema: {
        from: z.string().min(1),
        to: z.string().min(1),
        date,
        trainNumber: z.string().min(1),
      },
    },
    async (input) => {
      try {
        return text(await provider.getAvailability(input));
      } catch (e) {
        return toolError(e);
      }
    },
  );
  server.registerTool(
    'compare_trains',
    {
      description: 'Filter and sort journeys; this does not make subjective recommendations.',
      inputSchema: {
        from: z.string().min(1),
        to: z.string().min(1),
        date,
        ...filters,
        sortBy: z
          .enum(['departure_time', 'arrival_time', 'duration', 'price'])
          .default('departure_time'),
      },
    },
    async ({ sortBy, ...input }) => {
      try {
        const result = await journeys(provider, input);
        result.sort((a, b) =>
          sortBy === 'duration'
            ? a.durationMinutes - b.durationMinutes
            : sortBy === 'arrival_time'
              ? timeToMinutes(a.arrivalTime) - timeToMinutes(b.arrivalTime)
              : sortBy === 'price'
                ? minPrice(a) - minPrice(b)
                : timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime),
        );
        return text(result);
      } catch (e) {
        return toolError(e);
      }
    },
  );
  return server;
}
function minPrice(journey: { seatClasses: { fare?: { amount: number } }[] }): number {
  return Math.min(
    ...journey.seatClasses.map((seat) => seat.fare?.amount ?? Number.POSITIVE_INFINITY),
  );
}
