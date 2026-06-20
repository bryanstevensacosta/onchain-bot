import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { PublishStatus } from 'ca/publishing/telegram/domain/value-objects/publish-status.vo';
import { CallPublishedEvent } from 'ca/publishing/telegram/domain/events/call-published.event';
import { CallPublishFailedEvent } from 'ca/publishing/telegram/domain/events/call-publish-failed.event';

export interface PublishInput {
  readonly chain: ChainId;
  readonly address: string;
  readonly ticker: string | null;
  readonly score: number;
  readonly tier: string;
  readonly classification: string;
  readonly message: string;
  readonly targetChannels: ReadonlyArray<string>;
}

interface PublishedCallProps {
  readonly chain: ChainId;
  readonly address: string;
  readonly ticker: string | null;
  readonly score: number;
  readonly tier: string;
  readonly classification: string;
  readonly message: string;
  readonly targetChannels: ReadonlyArray<string>;
  readonly status: PublishStatus;
  readonly publishedChannelIds: ReadonlyArray<string>;
  readonly failedChannelIds: ReadonlyArray<string>;
  readonly publishedAt: Date;
}

/**
 * Record of a publish attempt for an approved token call.
 *
 * One PublishedCall per `(chain, address)` — re-publishes overwrite.
 * Tracks which output channels succeeded vs failed so we have an
 * audit trail.
 */
export class PublishedCall extends AggregateRoot<string> {
  private readonly state: PublishedCallProps;

  protected constructor(id: string, props: PublishedCallProps) {
    super(id);
    this.state = props;
  }

  public static create(
    input: PublishInput,
    results: {
      published: ReadonlyArray<string>;
      failed: ReadonlyArray<string>;
    },
  ): PublishedCall {
    if (!input.address) {
      throw new DomainError(ErrorCode.VALIDATION, `address cannot be empty`);
    }
    if (!input.message.trim()) {
      throw new DomainError(ErrorCode.VALIDATION, `message cannot be empty`);
    }
    const id = `${input.chain.value}:${input.address.toLowerCase()}`;
    const status =
      results.published.length > 0
        ? PublishStatus.PUBLISHED
        : PublishStatus.FAILED;
    return new PublishedCall(id, {
      chain: input.chain,
      address: input.address.toLowerCase(),
      ticker: input.ticker,
      score: input.score,
      tier: input.tier,
      classification: input.classification,
      message: input.message,
      targetChannels: Object.freeze([...input.targetChannels]),
      status,
      publishedChannelIds: Object.freeze([...results.published]),
      failedChannelIds: Object.freeze([...results.failed]),
      publishedAt: new Date(),
    });
  }

  public get chain(): ChainId {
    return this.state.chain;
  }
  public get address(): string {
    return this.state.address;
  }
  public get ticker(): string | null {
    return this.state.ticker;
  }
  public get score(): number {
    return this.state.score;
  }
  public get tier(): string {
    return this.state.tier;
  }
  public get classification(): string {
    return this.state.classification;
  }
  public get message(): string {
    return this.state.message;
  }
  public get targetChannels(): ReadonlyArray<string> {
    return this.state.targetChannels;
  }
  public get status(): PublishStatus {
    return this.state.status;
  }
  public get publishedChannelIds(): ReadonlyArray<string> {
    return this.state.publishedChannelIds;
  }
  public get failedChannelIds(): ReadonlyArray<string> {
    return this.state.failedChannelIds;
  }
  public get publishedAt(): Date {
    return this.state.publishedAt;
  }
  public get isPublished(): boolean {
    return this.state.status.value === 'PUBLISHED';
  }
  public get isFailed(): boolean {
    return this.state.status.value === 'FAILED';
  }
  public get successCount(): number {
    return this.state.publishedChannelIds.length;
  }

  public emit(): void {
    if (this.isPublished) {
      this.apply(
        new CallPublishedEvent({
          chain: this.state.chain.value,
          address: this.state.address,
          ticker: this.state.ticker,
          score: this.state.score,
          tier: this.state.tier,
          classification: this.state.classification,
          publishedChannelIds: [...this.state.publishedChannelIds],
          publishedAt: this.state.publishedAt,
        }),
      );
    } else {
      this.apply(
        new CallPublishFailedEvent({
          chain: this.state.chain.value,
          address: this.state.address,
          score: this.state.score,
          targetChannels: [...this.state.targetChannels],
          failedChannelIds: [...this.state.failedChannelIds],
          failedAt: this.state.publishedAt,
        }),
      );
    }
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
