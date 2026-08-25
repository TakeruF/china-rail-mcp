import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RailProvider } from './providers/types.js';
import { journeys, paginateJourneys, toolError } from './tools/common.js';
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
const pagination = (defaultLimit: number) => ({
  limit: z.number().int().min(1).max(50).default(defaultLimit),
  offset: z.number().int().min(0).default(0),
});
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

export function createServer(provider: RailProvider): McpServer {
  const server = new McpServer(
    { name: 'china-rail-mcp', version: '0.1.0' },
    {
      instructions:
        'Read-only official China Railway 12306 data. Resolve ambiguous stations with search_stations; never silently substitute a city for a station. Use limit/offset pagination for train searches. Data and fares are informational and important travel or payment details must be verified through official 12306 channels. Do not poll automatically.',
    },
  );
  server.registerTool(
    'get_provider_status',
    {
      description:
        'Return the official provider, its verified capabilities, and anonymous-session policy.',
      inputSchema: {},
      annotations: readOnlyAnnotations,
    },
    async () =>
      text({
        provider: '12306-official',
        capabilities: provider.capabilities,
        sessionPolicy: {
          authentication: 'none',
          userCookiesAccepted: false,
          anonymousCookies: 'memory-only',
          automaticPolling: false,
        },
      }),
  );
  server.registerTool(
    'search_stations',
    {
      description:
        'Search public Chinese railway stations. City names are not silently resolved to a specific station.',
      inputSchema: { query: z.string().min(1) },
      annotations: readOnlyAnnotations,
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
      description:
        'Search official read-only 12306 timetable, fare, and availability data. Results are paginated after filtering. Times are Asia/Shanghai.',
      inputSchema: {
        from: z.string().min(1),
        to: z.string().min(1),
        date,
        ...filters,
        ...pagination(20),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ limit, offset, ...input }) => {
      try {
        return text(paginateJourneys(await journeys(provider, input), { limit, offset }));
      } catch (e) {
        return toolError(e);
      }
    },
  );
  server.registerTool(
    'get_train_details',
    {
      description: 'Get an official train stop sequence for an exact train number and date.',
      inputSchema: { trainNumber: z.string().min(1), date },
      annotations: readOnlyAnnotations,
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
        'Get normalized official seat availability for an exact station pair, train, and date.',
      inputSchema: {
        from: z.string().min(1),
        to: z.string().min(1),
        date,
        trainNumber: z.string().min(1),
      },
      annotations: readOnlyAnnotations,
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
      description:
        'Filter, sort, and paginate journeys; this does not make subjective recommendations.',
      inputSchema: {
        from: z.string().min(1),
        to: z.string().min(1),
        date,
        ...filters,
        ...pagination(10),
        sortBy: z
          .enum(['departure_time', 'arrival_time', 'duration', 'price'])
          .default('departure_time'),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ sortBy, limit, offset, ...input }) => {
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
        return text(paginateJourneys(result, { limit, offset }));
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
