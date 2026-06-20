/**
 * Centralized error type for the application.
 *
 * Distinguishes between expected domain errors (use ErrorCode) and
 * unexpected system errors (throw regular Error or HttpException).
 */
export const ErrorCode = {
  // Generic
  INTERNAL: 'INTERNAL',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  CONFLICT: 'CONFLICT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',

  // Token context
  TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  UNSUPPORTED_CHAIN: 'UNSUPPORTED_CHAIN',
  HONEYPOT_DETECTED: 'HONEYPOT_DETECTED',

  // Trading context
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  SLIPPAGE_EXCEEDED: 'SLIPPAGE_EXCEEDED',
  ORDER_FAILED: 'ORDER_FAILED',

  // CA pipeline
  NO_CONTRACT_ADDRESS: 'NO_CONTRACT_ADDRESS',
  NO_PARSED_CALL: 'NO_PARSED_CALL',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCodeType,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
