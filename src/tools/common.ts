import { RailError } from '../errors.js';
import type { RailProvider } from '../providers/types.js';
import type { TrainJourney } from '../domain/train.js';
import { timeToMinutes } from '../utils/date.js';
export interface QueryFilters {
  departAfter?: string | undefined;
  departBefore?: string | undefined;
  trainTypes?: string[] | undefined;
  seatClass?: string | undefined;
  onlyAvailable?: boolean | undefined;
}
export interface PaginationInput {
  limit: number;
  offset: number;
}
export interface PaginatedJourneys extends PaginationInput {
  total: number;
  returned: number;
  hasMore: boolean;
  nextOffset: number | null;
  journeys: TrainJourney[];
}
export function filterJourneys(journeys: TrainJourney[], filters: QueryFilters): TrainJourney[] {
  return journeys.filter(
    (j) =>
      (!filters.departAfter ||
        timeToMinutes(j.departureTime) >= timeToMinutes(filters.departAfter)) &&
      (!filters.departBefore ||
        timeToMinutes(j.departureTime) <= timeToMinutes(filters.departBefore)) &&
      (!filters.trainTypes ||
        filters.trainTypes.some((trainType) => trainType.toUpperCase() === j.trainType)) &&
      (!filters.seatClass || j.seatClasses.some((s) => s.seatClass === filters.seatClass)) &&
      (!filters.onlyAvailable ||
        j.seatClasses.some(
          (s) =>
            (!filters.seatClass || s.seatClass === filters.seatClass) &&
            s.availability?.status === 'available',
        )),
  );
}
export function paginateJourneys(
  journeys: TrainJourney[],
  { limit, offset }: PaginationInput,
): PaginatedJourneys {
  const page = journeys.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const hasMore = nextOffset < journeys.length;
  return {
    total: journeys.length,
    limit,
    offset,
    returned: page.length,
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
    journeys: page,
  };
}
export function toolError(error: unknown): {
  content: [{ type: 'text'; text: string }];
  isError: true;
} {
  const e =
    error instanceof RailError
      ? error
      : new RailError('UPSTREAM_TEMPORARILY_UNAVAILABLE', 'An unexpected upstream error occurred.');
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          code: e.code,
          message: e.message,
          ...(e.candidates ? { candidates: e.candidates } : {}),
          ...(e.details ? { details: e.details } : {}),
        }),
      },
    ],
    isError: true,
  };
}
export async function journeys(
  provider: RailProvider,
  input: { from: string; to: string; date: string } & QueryFilters,
): Promise<TrainJourney[]> {
  return filterJourneys(await provider.searchTrains(input), input);
}
