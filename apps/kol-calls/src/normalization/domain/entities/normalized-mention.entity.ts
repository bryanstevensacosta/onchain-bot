import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainEvent } from '../../../shared/kernel/domain-event';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { NormalizedAddress } from '../../../shared/value-objects/normalized-address.vo';
import { CallNormalizedEvent } from '../events/call-normalized.event';

export interface NormalizedMentionProps {
  readonly kolId: string;
  readonly messageId: number;
  /** 0-based occurrence index of this mention within the message (mirrors the parsed call). */
  readonly contractIndex: number;
  readonly occurredAt: Date;
  readonly contractAddress: NormalizedAddress;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly chart: string | null;
  readonly handle: string | null;
  readonly channelId: string | null;
}

/**
 * One normalized row per KOL mention (P1: mention index, G-12).
 *
 * Explicitly NOT the backend `CanonicalTokenCall` single-card-per-coin
 * shape: repeats of the same contract are first-class rows, each with its
 * OWN id (`chain:address:kolId:messageId:contractIndex`). The use case
 * persists one row per parsed call and returns one
 * `normalization.call.normalized` event per row (direct return, no bus).
 *
 * Pure-data aggregate (like `ParsedCall`): `mutate` is a no-op;
 * persistence goes through the repository port, never direct DB.
 */
export class NormalizedMention extends AggregateRoot<string> {
  private constructor(
    id: string,
    private readonly props: NormalizedMentionProps,
  ) {
    super(id);
  }

  public static create(
    input: NormalizedMentionProps & { id?: string },
  ): NormalizedMention {
    if (!input.kolId) {
      throw new DomainError(ErrorCode.VALIDATION, 'kolId must not be empty');
    }
    if (!Number.isInteger(input.messageId) || input.messageId < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid messageId: ${input.messageId}`,
        { messageId: input.messageId },
      );
    }
    if (!Number.isInteger(input.contractIndex) || input.contractIndex < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid contractIndex: ${input.contractIndex}`,
        { contractIndex: input.contractIndex },
      );
    }
    if (!input.contractAddress) {
      throw new DomainError(
        ErrorCode.NO_CONTRACT_ADDRESS,
        'Cannot build NormalizedMention without a contract address',
        { kolId: input.kolId, messageId: input.messageId },
      );
    }
    const chain = input.contractAddress.chainHint.value;
    const id =
      input.id ??
      `${chain}:${input.contractAddress.value}:${input.kolId}:${input.messageId}:${input.contractIndex}`;
    return new NormalizedMention(id, {
      kolId: input.kolId,
      messageId: input.messageId,
      contractIndex: input.contractIndex,
      occurredAt: input.occurredAt,
      contractAddress: input.contractAddress,
      ticker: input.ticker,
      name: input.name,
      chart: input.chart,
      handle: input.handle,
      channelId: input.channelId,
    });
  }

  public get kolId(): string {
    return this.props.kolId;
  }

  public get messageId(): number {
    return this.props.messageId;
  }

  public get contractIndex(): number {
    return this.props.contractIndex;
  }

  public get occurredAt(): Date {
    return this.props.occurredAt;
  }

  public get address(): NormalizedAddress {
    return this.props.contractAddress;
  }

  public get chain(): string {
    return this.props.contractAddress.chainHint.value;
  }

  public get ticker(): string | null {
    return this.props.ticker;
  }

  public get name(): string | null {
    return this.props.name;
  }

  public get chart(): string | null {
    return this.props.chart;
  }

  public get handle(): string | null {
    return this.props.handle;
  }

  public get channelId(): string | null {
    return this.props.channelId;
  }

  public emitNormalized(): void {
    this.apply(
      new CallNormalizedEvent({
        mentionId: this.id,
        chain: this.chain,
        address: this.address.value,
        ticker: this.props.ticker,
        name: this.props.name,
        chart: this.props.chart,
        kolId: this.props.kolId,
        handle: this.props.handle,
        channelId: this.props.channelId,
        messageId: this.props.messageId,
        contractIndex: this.props.contractIndex,
        occurredAt: this.props.occurredAt,
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    // Pure-data aggregate: no state transitions from events.
  }
}
