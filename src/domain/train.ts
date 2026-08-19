import type { SeatOffer } from './seat.js';
export interface TrainJourney {
  trainNumber: string;
  originStation: string;
  departureStation: string;
  destinationStation: string;
  arrivalStation: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  trainType: string;
  seatClasses: SeatOffer[];
  retrievedAt: string;
}
export interface TrainStop {
  order: number;
  station: string;
  arrivalTime: string | null;
  departureTime: string | null;
  stopDurationMinutes: number | null;
}
export interface TrainDetails {
  trainNumber: string;
  date: string;
  stops: TrainStop[];
  retrievedAt: string;
}
