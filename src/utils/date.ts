import { RailError } from '../errors.js';
export function assertTravelDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`)))
    throw new RailError('INVALID_DATE', 'Date must be a real YYYY-MM-DD date in Asia/Shanghai.');
}
export function parseDuration(value: string): number {
  const match = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(value);
  if (!match)
    throw new RailError('UPSTREAM_RESPONSE_CHANGED', `Invalid upstream duration: ${value}`);
  return Number(match[1] ?? 0) * 60 + Number(match[2]) + (Number(match[3]) >= 30 ? 1 : 0);
}
export function timeToMinutes(value: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59)
    throw new RailError('UPSTREAM_RESPONSE_CHANGED', `Invalid upstream time: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}
