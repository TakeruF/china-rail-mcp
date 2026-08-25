import type { AvailabilityStatus, Fare, SeatAvailabilityValue, SeatClass } from '../domain/seat.js';
const map: Record<string, SeatClass> = {
  商务座: 'business',
  特等座: 'premium_first',
  优选一等座: 'premium_first',
  一等座: 'first_class',
  二等座: 'second_class',
  动卧: 'soft_sleeper',
  软卧: 'soft_sleeper',
  硬卧: 'hard_sleeper',
  软座: 'soft_seat',
  硬座: 'hard_seat',
  无座: 'standing',
};
export function normalizeSeatClass(label: string): SeatClass {
  return map[label] ?? 'other';
}
export function normalizeAvailability(value: string): SeatAvailabilityValue {
  const v = value.trim();
  const count = /^\d+$/.test(v) ? Number(v) : undefined;
  const status: AvailabilityStatus =
    count !== undefined
      ? count > 0
        ? 'available'
        : 'unavailable'
      : v === '有'
        ? 'available'
        : v === '无'
          ? 'unavailable'
          : /候补/.test(v)
            ? 'waitlist'
            : 'unknown';
  return { status, ...(count !== undefined ? { count } : {}), upstreamValue: value };
}
export function parseFare(value: string): Fare | undefined {
  const m = /^(?:¥|￥)?(\d+(?:\.\d{1,2})?)$/.exec(value.trim());
  return m ? { amount: Number(m[1]), currency: 'CNY' } : undefined;
}
