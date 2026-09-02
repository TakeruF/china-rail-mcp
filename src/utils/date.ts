import { RailError } from '../errors.js';

export const QUERY_WINDOW_DAYS = 15;

export interface TicketQueryWindow {
  today: string;
  lastQueryableDate: string;
  expectedSalesOpenDate: string;
  daysAhead: number;
  status: 'sales_closed' | 'queryable' | 'not_on_sale';
}

export function assertTravelDate(date: string): void {
  const parts = parseDateParts(date);
  if (!parts || !isRealDate(parts))
    throw new RailError('INVALID_DATE', 'Date must be a real YYYY-MM-DD date in Asia/Shanghai.');
}

export function assertQueryableTravelDate(date: string, now = new Date()): void {
  const window = ticketQueryWindow(date, now);
  if (window.status === 'sales_closed') {
    throw new RailError(
      'DATE_OUTSIDE_QUERY_WINDOW',
      `12306 currently accepts ticket queries from ${window.today} through ${window.lastQueryableDate} ` +
        `(${QUERY_WINDOW_DAYS} days including today).`,
      undefined,
      {
        requestedDate: date,
        ticketStatus: window.status,
        queryableFrom: window.today,
        queryableThrough: window.lastQueryableDate,
      },
    );
  }
  if (window.status === 'not_on_sale')
    throw new RailError(
      'DATE_OUTSIDE_TICKET_WINDOW',
      `Tickets for ${date} are not yet in the current 12306 query window. ` +
        `The expected sales-opening date is ${window.expectedSalesOpenDate}; ` +
        'the station-specific release time may vary.',
      undefined,
      {
        requestedDate: date,
        ticketStatus: window.status,
        expectedSalesOpenDate: window.expectedSalesOpenDate,
        retryFrom: window.expectedSalesOpenDate,
        queryableThrough: window.lastQueryableDate,
        timetableMayBeAvailable: true,
        suggestedTool: 'get_train_details',
        requiresTrainNumber: true,
      },
    );
}

export function ticketQueryWindow(date: string, now = new Date()): TicketQueryWindow {
  assertTravelDate(date);
  const today = chinaDate(now);
  const daysAhead = dayNumber(date) - dayNumber(today);
  return {
    today,
    lastQueryableDate: addDays(today, QUERY_WINDOW_DAYS - 1),
    expectedSalesOpenDate: addDays(date, -(QUERY_WINDOW_DAYS - 1)),
    daysAhead,
    status:
      daysAhead < 0 ? 'sales_closed' : daysAhead >= QUERY_WINDOW_DAYS ? 'not_on_sale' : 'queryable',
  };
}

function parseDateParts(date: string): [number, number, number] | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isRealDate([year, month, day]: [number, number, number]): boolean {
  const value = new Date(Date.UTC(year, month - 1, day));
  return (
    value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day
  );
}

function dayNumber(date: string): number {
  const parts = parseDateParts(date);
  if (!parts) throw new RailError('INVALID_DATE', 'Date must use YYYY-MM-DD.');
  return Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86_400_000;
}

function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

function chinaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
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
