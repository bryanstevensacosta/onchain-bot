import { AggregateRoot } from '../../../shared/kernel/aggregate-root';
import { DomainEvent } from '../../../shared/kernel/domain-event';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { NormalizedAddress } from '../../../shared/value-objects/normalized-address.vo';
import { Ticker } from '../value-objects/ticker.vo';
import { Url } from '../value-objects/url.vo';
import { ExtractionSnapshotBase } from '../snapshot-base';

export interface ExtractionCandidateProps {
  readonly kolId: string;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly contractAddress: NormalizedAddress;
  /** 0-based occurrence index of this contract within the message. */
  readonly contractIndex: number;
  readonly tickers: ReadonlyArray<Ticker>;
  readonly urls: ReadonlyArray<Url>;
  readonly handle: string | null;
  readonly channelUrl: string | null;
  readonly channelId: string | null;
  readonly channelTitle: string | null;
}

/**
 * One smart-contract mention by a KOL (P5: contract x mention).
 *
 * Each occurrence in a message is its OWN row with its OWN db-id
 * (`${kolId}:${messageId}:${contractIndex}`): multi-tip messages do NOT
 * collapse and repeats are valid (feed "called from @handle 8min ago").
 * The only guard is double-delivery: re-saving the same deterministic id
 * upserts instead of duplicating (P1).
 *
 * Pure-data aggregate (like the backend `ExtractionResult`): `mutate` is a
 * no-op; persistence goes through the repository port, never direct DB.
 */
export class ExtractionCandidate extends AggregateRoot<string> {
  private constructor(
    id: string,
    private readonly props: ExtractionCandidateProps,
  ) {
    super(id);
  }

  public static create(
    input: ExtractionCandidateProps & { id?: string },
  ): ExtractionCandidate {
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
    const id =
      input.id ?? `${input.kolId}:${input.messageId}:${input.contractIndex}`;
    return new ExtractionCandidate(id, {
      kolId: input.kolId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      contractAddress: input.contractAddress,
      contractIndex: input.contractIndex,
      tickers: Object.freeze([...input.tickers]),
      urls: Object.freeze([...input.urls]),
      handle: input.handle,
      channelUrl: input.channelUrl,
      channelId: input.channelId,
      channelTitle: input.channelTitle,
    });
  }

  public get kolId(): string {
    return this.props.kolId;
  }

  public get messageId(): number {
    return this.props.messageId;
  }

  public get occurredAt(): Date {
    return this.props.occurredAt;
  }

  public get contractAddress(): NormalizedAddress {
    return this.props.contractAddress;
  }

  public get contractIndex(): number {
    return this.props.contractIndex;
  }

  public get tickers(): ReadonlyArray<Ticker> {
    return this.props.tickers;
  }

  public get urls(): ReadonlyArray<Url> {
    return this.props.urls;
  }

  public get handle(): string | null {
    return this.props.handle;
  }

  public get channelUrl(): string | null {
    return this.props.channelUrl;
  }

  public get channelId(): string | null {
    return this.props.channelId;
  }

  public get channelTitle(): string | null {
    return this.props.channelTitle;
  }

  /**
   * P26: snapshot base for this mention. `occurred_at_telegram` carries the
   * Telegram capture time; `ingested_at_kol` is stamped by the caller (the
   * use case passes `now` at extraction). `enriched_at` is set later by
   * enrichment — never here.
   */
  public toSnapshotBase(ingestedAtKol: Date): ExtractionSnapshotBase {
    return {
      mentionId: this.id,
      kolId: this.props.kolId,
      messageId: this.props.messageId,
      contractAddress: this.props.contractAddress.value,
      chainHint: this.props.contractAddress.chainHint.value,
      occurred_at_telegram: this.props.occurredAt,
      ingested_at_kol: ingestedAtKol,
    };
  }

  protected mutate(_event: DomainEvent): void {
    // Pure-data aggregate: no state transitions from events.
  }
}
