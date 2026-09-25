import { DomainError, ErrorCode } from '../kernel/domain-error';

/**
 * Typed domain exceptions (Tramo 2, todo 1).
 *
 * Throw these in application code; DomainExceptionFilter maps them
 * to HTTP. P10: no kol/vip-call error variants exist in this app.
 */
export class QueueFullError extends DomainError {
  constructor(pending: number) {
    super(ErrorCode.QUEUE_FULL, `Publisher queue is full (${pending} pending)`, {
      pending,
    });
    this.name = 'QueueFullError';
  }
}

export class LlmFailedError extends DomainError {
  constructor(reason: string) {
    super(ErrorCode.LLM_FAILED, `LLM generation failed: ${reason}`, {
      reason,
    });
    this.name = 'LlmFailedError';
  }
}

export class PublishFailedError extends DomainError {
  constructor(reason: string) {
    super(ErrorCode.PUBLISH_FAILED, `Telegram publish failed: ${reason}`, {
      reason,
    });
    this.name = 'PublishFailedError';
  }
}
