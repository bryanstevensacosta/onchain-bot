/**
 * ErrorCode catalog + DomainError base (Tramo 3, todo 1).
 *
 * DomainError -> HTTP status via DomainExceptionFilter.
 */
export enum ErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION = 'VALIDATION',
  CONFLICT = 'CONFLICT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMITED = 'RATE_LIMITED',
  PROVIDER_FAILED = 'PROVIDER_FAILED',
  INTERNAL = 'INTERNAL',
}

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
