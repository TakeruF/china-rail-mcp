export type RailErrorCode =
  | 'STATION_NOT_FOUND'
  | 'AMBIGUOUS_STATION'
  | 'INVALID_DATE'
  | 'DATE_OUTSIDE_QUERY_WINDOW'
  | 'JOURNEY_NOT_FOUND'
  | 'PROVIDER_CAPABILITY_UNAVAILABLE'
  | 'UPSTREAM_TEMPORARILY_UNAVAILABLE'
  | 'UPSTREAM_QUERY_REJECTED'
  | 'UPSTREAM_RESPONSE_CHANGED'
  | 'RATE_LIMITED'
  | 'NETWORK_TIMEOUT';
export class RailError extends Error {
  constructor(
    public readonly code: RailErrorCode,
    message: string,
    public readonly candidates?: string[],
  ) {
    super(message);
    this.name = 'RailError';
  }
}
