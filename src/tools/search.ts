import type { Station } from '../domain/station.js';
import type { TrainJourney } from '../domain/train.js';
import { RailError } from '../errors.js';
import type { RailProvider, SearchTrainsInput } from '../providers/types.js';
import { timeToMinutes } from '../utils/date.js';
import { filterJourneys, type QueryFilters } from './common.js';

export type SearchScope = 'station' | 'city';
export interface ScopedSearchInput extends SearchTrainsInput, QueryFilters {
  scope?: SearchScope | undefined;
  fromScope?: SearchScope | undefined;
  toScope?: SearchScope | undefined;
}

async function resolveScope(provider: RailProvider, value: string, scope: SearchScope) {
  const query = value.trim();
  const candidates = await provider.searchStations(query);
  const exact = candidates.filter(
    (station) => station.name === query || station.code.toLowerCase() === query.toLowerCase(),
  );
  let selected: Station[];
  if (scope === 'station') {
    selected = exact;
  } else {
    const cities = new Set(
      candidates.filter((station) => station.city === query).map((station) => station.city),
    );
    if (cities.size === 0) {
      // An exact station/code or city pinyin can identify its official city group.
      for (const station of candidates.filter(
        (station) =>
          exact.includes(station) || station.pinyin?.toLowerCase() === query.toLowerCase(),
      ))
        cities.add(station.city);
    }
    if (cities.size > 1)
      throw new RailError('AMBIGUOUS_STATION', `Multiple cities match ${value}.`, [...cities]);
    const city = [...cities][0];
    selected = city
      ? (await provider.searchStations(city)).filter((station) => station.city === city)
      : [];
  }
  selected = [...new Map(selected.map((station) => [station.code, station])).values()].sort(
    (a, b) => a.code.localeCompare(b.code),
  );
  if (selected.length === 0)
    throw new RailError(
      'STATION_NOT_FOUND',
      `No ${scope} exactly matches ${value}. Use search_stations first.`,
    );
  if (scope === 'station' && selected.length > 1)
    throw new RailError(
      'AMBIGUOUS_STATION',
      `Multiple stations match ${value}. Use an exact station code.`,
      selected.map((station) => station.name),
    );

  const selectedCodes = new Set(selected.map((station) => station.code));
  const excluded = new Map<string, Station>();
  if (scope === 'station') {
    for (const city of new Set(selected.map((station) => station.city))) {
      for (const station of await provider.searchStations(city)) {
        if (station.city === city && !selectedCodes.has(station.code))
          excluded.set(station.code, station);
      }
    }
  }
  return {
    selected,
    excluded: [...excluded.values()]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((station) => ({ ...station, reason: 'station_scope' as const })),
  };
}

export async function searchJourneys(provider: RailProvider, input: ScopedSearchInput) {
  const fromScope = input.fromScope ?? input.scope ?? 'station';
  const toScope = input.toScope ?? input.scope ?? 'station';
  const from = await resolveScope(provider, input.from, fromScope);
  const to = await resolveScope(provider, input.to, toScope);
  const merged = new Map<string, TrainJourney>();
  // Query every pair sequentially to avoid a burst of requests to the official service.
  // Fail the whole search if any pair fails, so a partial result cannot imply full coverage.
  for (const departure of from.selected) {
    for (const arrival of to.selected) {
      const journeys = await provider.searchTrains({
        from: departure.code,
        to: arrival.code,
        date: input.date,
      });
      for (const journey of journeys) {
        const key = JSON.stringify([
          journey.trainNumber,
          journey.departureStation,
          journey.arrivalStation,
          journey.departureTime,
          journey.arrivalTime,
        ]);
        if (!merged.has(key)) merged.set(key, journey);
      }
    }
  }
  const journeys = [...merged.values()].sort(
    (a, b) =>
      timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime) ||
      a.durationMinutes - b.durationMinutes ||
      a.trainNumber.localeCompare(b.trainNumber) ||
      a.departureStation.localeCompare(b.departureStation) ||
      a.arrivalStation.localeCompare(b.arrivalStation),
  );
  // Compare against the complete route result before user filters or pagination.
  const durations = journeys.map((journey) => journey.durationMinutes).filter((n) => n > 0);
  const shortestDurationMinutes = durations.length ? Math.min(...durations) : null;
  const durationMultiplier = 3;
  const minimumExtraMinutes = 120;
  const flagged = journeys.map((journey) => ({
    ...journey,
    isPotentialDetour:
      shortestDurationMinutes !== null &&
      journey.durationMinutes >= shortestDurationMinutes * durationMultiplier &&
      journey.durationMinutes - shortestDurationMinutes >= minimumExtraMinutes,
  }));
  return {
    searchScope: { from: fromScope, to: toScope },
    searchedStations: { from: from.selected, to: to.selected },
    excludedStations: { from: from.excluded, to: to.excluded },
    detourHeuristic: {
      shortestDurationMinutes,
      durationMultiplier,
      minimumExtraMinutes,
      description: 'Duration-based indication only; does not confirm the actual route is a detour.',
    },
    journeys: filterJourneys(flagged, input),
  };
}
