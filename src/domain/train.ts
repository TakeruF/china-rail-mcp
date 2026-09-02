import type { SeatOffer } from './seat.js';

export const TRAIN_TYPE_CODES = ['G', 'D', 'C', 'S', 'Z', 'T', 'K', 'L', 'Y', 'OTHER'] as const;
export type TrainType = (typeof TRAIN_TYPE_CODES)[number];

export interface TrainJourney {
  trainNumber: string;
  originStation: string;
  departureStation: string;
  destinationStation: string;
  arrivalStation: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  trainType: TrainType;
  trainTypeLabel: string;
  upstreamTrainType?: string;
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
  timetableStatus: 'published';
  bookingStatus: 'not_checked' | 'not_on_sale' | 'sales_closed';
  availability: null;
  expectedSalesOpenDate?: string;
  stops: TrainStop[];
  retrievedAt: string;
}
