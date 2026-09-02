export type SeatClass =
  | 'business'
  | 'premium_first'
  | 'first_class'
  | 'second_class'
  | 'advanced_soft_sleeper'
  | 'dynamic_sleeper'
  | 'soft_sleeper'
  | 'hard_sleeper'
  | 'soft_seat'
  | 'hard_seat'
  | 'standing'
  | 'other';
export type AvailabilityStatus = 'available' | 'unavailable' | 'waitlist' | 'unknown';
export interface Fare {
  amount: number;
  currency: 'CNY';
}
export interface SeatOffer {
  seatClass: SeatClass;
  upstreamLabel: string;
  fare?: Fare;
  availability?: SeatAvailabilityValue;
}
export interface SeatAvailabilityValue {
  status: AvailabilityStatus;
  count?: number;
  upstreamValue: string;
}
export interface SeatAvailability {
  retrievedAt: string;
  seats: Partial<Record<SeatClass, SeatAvailabilityValue>>;
}
