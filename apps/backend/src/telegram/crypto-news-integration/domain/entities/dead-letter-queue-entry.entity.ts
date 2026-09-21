import * as crypto from 'node:crypto';
import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';

export type DeadLetterStatus = 'PENDING' | 'RETRIED' | 'DISCARDED';

export interface DeadLetterQueueEntryProps {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly failureReason: string;
  readonly failedPayload: string | null;
  readonly failedAt: Date;
  retryCount: number;
  status: DeadLetterStatus;
}

/**
 * Aggregate root: a failed crypto-news message captured for manual retry.
 *
 * FK-LESS BY DESIGN: `channelId`/`messageId` are opaque content-snapshot
 * coordinates with no FK to any crypto-news table — those tables
 * (`crypto_news_sources`, `crypto_news_messages`, `crypto_news_message_media`)
 * live ONLY in ingestion-telegram's `<base>_ingestion` DB since the
 * ownership split of 2026-09-08. The DLQ stores the failure reason +
 * a JSON-string snapshot of the failed payload, never live relations.
 *
 * Lifecycle (manual on-demand ONLY, never automatic):
 *   PENDING → RETRIED (operator POSTs /crypto-news/dead-letter/:id/retry)
 *   PENDING → DISCARDED (operator gives up)
 */
export class DeadLetterQueueEntry extends AggregateRoot<string> {
  private state: DeadLetterQueueEntryProps;

  protected constructor(id: string, props: DeadLetterQueueEntryProps) {
    super(id);
    this.state = props;
  }

  /**
   * Factory: build a fresh PENDING entry from a failed message.
   * Never throws for empty payload — only for missing coordinates/reason.
   */
  public static create(input: {
    id?: string;
    channelId: string;
    messageId: number;
    failureReason: string;
    failedPayload?: string | null;
    failedAt?: Date;
  }): DeadLetterQueueEntry {
    if (!input.channelId?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DeadLetterQueueEntry channelId cannot be empty',
      );
    }
    if (!Number.isFinite(input.messageId) || input.messageId < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DeadLetterQueueEntry messageId must be a non-negative number',
        { messageId: input.messageId },
      );
    }
    if (!input.failureReason?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'DeadLetterQueueEntry failureReason cannot be empty',
      );
    }
    const id = input.id ?? crypto.randomUUID();
    return new DeadLetterQueueEntry(id, {
      id,
      channelId: input.channelId,
      messageId: input.messageId,
      failureReason: input.failureReason,
      failedPayload: input.failedPayload ?? null,
      failedAt: input.failedAt ?? new Date(),
      retryCount: 0,
      status: 'PENDING',
    });
  }

  /**
   * Rehydrate from persistence without validation (use the persisted
   * shape as-is).
   */
  public static reconstitute(
    props: DeadLetterQueueEntryProps,
  ): DeadLetterQueueEntry {
    return new DeadLetterQueueEntry(props.id, props);
  }

  public get id(): string {
    return this.state.id;
  }

  public get channelId(): string {
    return this.state.channelId;
  }

  public get messageId(): number {
    return this.state.messageId;
  }

  public get failureReason(): string {
    return this.state.failureReason;
  }

  public get failedPayload(): string | null {
    return this.state.failedPayload;
  }

  public get failedAt(): Date {
    return this.state.failedAt;
  }

  public get retryCount(): number {
    return this.state.retryCount;
  }

  public get status(): DeadLetterStatus {
    return this.state.status;
  }

  /**
   * Transition PENDING → RETRIED. Records a retry attempt.
   * Only PENDING entries can be retried; terminal states throw.
   */
  public markRetried(): void {
    if (this.state.status !== 'PENDING') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Cannot markRetried: aggregate is in ${this.state.status} state (expected PENDING)`,
        { id: this.state.id, status: this.state.status },
      );
    }
    this.state.status = 'RETRIED';
    this.state.retryCount += 1;
  }

  /**
   * Transition PENDING → DISCARDED. Operator gives up on this entry.
   */
  public markDiscarded(): void {
    if (this.state.status !== 'PENDING') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Cannot markDiscarded: aggregate is in ${this.state.status} state (expected PENDING)`,
        { id: this.state.id, status: this.state.status },
      );
    }
    this.state.status = 'DISCARDED';
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
