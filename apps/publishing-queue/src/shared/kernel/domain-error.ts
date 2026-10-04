/**
 * ErrorCode catalog + DomainError base (Tramo 2, todo 1).
 *
 * Mirrors apps/backend/src/shared/filters/domain-error.filter.ts
 * contract: DomainError -> HTTP status via DomainExceptionFilter.
 */
export enum ErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION = 'VALIDATION',
  CONFLICT = 'CONFLICT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMITED = 'RATE_LIMITED',
  QUEUE_FULL = 'QUEUE_FULL',
  LLM_FAILED = 'LLM_FAILED',
  PUBLISH_FAILED = 'PUBLISH_FAILED',
  /** Contract §2 schedule-time rejection (HTTP 422, never silently fixed). */
  SCHEDULE_INVALID = 'SCHEDULE_INVALID',
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
