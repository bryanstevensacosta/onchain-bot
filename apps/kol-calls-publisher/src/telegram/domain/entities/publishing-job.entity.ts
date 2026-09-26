import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import type { DomainEvent } from '../../../shared/kernel/domain-event';
import {
  PublishingJobFailedEvent,
  PublishingJobPublishedEvent,
} from '../events/publishing-events';

export type PublishingJobStatus = 'reserved' | 'published' | 'failed';

export interface CreatePublishingJobInput {
  readonly id?: string;
  readonly templateId: string;
  readonly mentionId: string;
  readonly ticker: string | null;
  readonly chain: string;
  readonly address: string;
  readonly channelTarget: string;
  readonly message: string;
}

/**
 * One publish attempt for one approved mention (Tramo 1, todo 11, Ph11).
 *
 * Ticker is NON-NULL by construction: `create` throws VALIDATION on
 * null/blank tickers, so an unresolved ticker can never reach the Bot API
 * (backend ticker-null invariant, enforced at the publisher boundary only —
 * approval/tracking tolerate null by design).
 */
export class PublishingJob extends AggregateRoot<string> {
  private readonly templateIdValue: string;
  private readonly mentionIdValue: string;
  private readonly tickerValue: string;
  private readonly chainValue: string;
  private readonly addressValue: string;
  private readonly channelTargetValue: string;
  private readonly messageValue: string;
  private statusValue: PublishingJobStatus = 'reserved';
  private telegramMessageIdValue: number | null = null;
  private failedReasonValue: string | null = null;
  private readonly createdAt: Date;
  private finalizedAtValue: Date | null = null;

  private constructor(
    id: string,
    input: Omit<Required<CreatePublishingJobInput>, 'id' | 'ticker'> & {
      ticker: string;
    },
  ) {
    super(id);
    this.templateIdValue = input.templateId;
    this.mentionIdValue = input.mentionId;
    this.tickerValue = input.ticker;
    this.chainValue = input.chain;
    this.addressValue = input.address;
    this.channelTargetValue = input.channelTarget;
    this.messageValue = input.message;
    this.createdAt = new Date();
  }

  public static create(input: CreatePublishingJobInput): PublishingJob {
    if (!input.ticker?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ticker must be resolved before publishing (never null pre-publisher)',
        { templateId: input.templateId, mentionId: input.mentionId },
      );
    }
    if (!input.templateId?.trim() || !input.mentionId?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'templateId and mentionId must not be empty',
      );
    }
    if (!input.channelTarget?.trim() || !input.message?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'channelTarget and message must not be empty',
        {
          mentionId: input.mentionId,
        },
      );
    }
    return new PublishingJob(input.id ?? randomUUID(), {
      templateId: input.templateId,
      mentionId: input.mentionId,
      ticker: input.ticker.trim(),
      chain: input.chain,
      address: input.address,
      channelTarget: input.channelTarget,
      message: input.message,
    });
  }

  public get templateId(): string {
    return this.templateIdValue;
  }

  public get mentionId(): string {
    return this.mentionIdValue;
  }

  public get ticker(): string {
    return this.tickerValue;
  }

  public get chain(): string {
    return this.chainValue;
  }

  public get address(): string {
    return this.addressValue;
  }

  public get channelTarget(): string {
    return this.channelTargetValue;
  }

  public get message(): string {
    return this.messageValue;
  }

  public get status(): PublishingJobStatus {
    return this.statusValue;
  }

  public get telegramMessageId(): number | null {
    return this.telegramMessageIdValue;
  }

  public get failedReason(): string | null {
    return this.failedReasonValue;
  }

  public get createdAtDate(): Date {
    return this.createdAt;
  }

  public get finalizedAt(): Date | null {
    return this.finalizedAtValue;
  }

  public markPublished(telegramMessageId: number | null): void {
    this.guardReserved();
    this.statusValue = 'published';
    this.telegramMessageIdValue = telegramMessageId;
    this.finalizedAtValue = new Date();
    this.apply(
      new PublishingJobPublishedEvent({
        jobId: this.id,
        templateId: this.templateIdValue,
        mentionId: this.mentionIdValue,
        channelTarget: this.channelTargetValue,
        telegramMessageId,
        reason: null,
      }),
    );
  }

  public markFailed(reason: string): void {
    this.guardReserved();
    this.statusValue = 'failed';
    this.failedReasonValue = reason;
    this.finalizedAtValue = new Date();
    this.apply(
      new PublishingJobFailedEvent({
        jobId: this.id,
        templateId: this.templateIdValue,
        mentionId: this.mentionIdValue,
        channelTarget: this.channelTargetValue,
        telegramMessageId: null,
        reason,
      }),
    );
  }

  private guardReserved(): void {
    if (this.statusValue !== 'reserved') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `publishing job ${this.id} already finalized (${this.statusValue})`,
        {
          id: this.id,
        },
      );
    }
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
