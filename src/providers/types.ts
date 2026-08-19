import type { SeatAvailability } from '../domain/seat.js';
import type { Station } from '../domain/station.js';
import type { TrainDetails, TrainJourney } from '../domain/train.js';
export interface SearchTrainsInput {
  from: string;
  to: string;
  date: string;
}
export interface TrainDetailsInput {
  trainNumber: string;
  date: string;
}
export interface AvailabilityInput {
  from: string;
  to: string;
  date: string;
  trainNumber: string;
}
export interface RailProviderCapabilities {
  stationSearch: boolean;
  timetable: boolean;
  trainStops: boolean;
  fares: boolean;
  availability: boolean;
}
export interface RailProvider {
  readonly capabilities: RailProviderCapabilities;
  searchStations(query: string): Promise<Station[]>;
  searchTrains(input: SearchTrainsInput): Promise<TrainJourney[]>;
  getTrainDetails(input: TrainDetailsInput): Promise<TrainDetails>;
  getAvailability(input: AvailabilityInput): Promise<SeatAvailability>;
}
