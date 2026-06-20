import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ContractAddress } from 'ca/extraction/domain/value-objects/contract-address.vo';
import { Ticker } from 'ca/extraction/domain/value-objects/ticker.vo';
import { Url } from 'ca/extraction/domain/value-objects/url.vo';
import { CandidatesExtractedEvent } from 'ca/extraction/domain/events/candidates-extracted.event';

interface ExtractionResultProps {
  readonly channelId: string;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly rawText: string;
  readonly contractAddresses: ReadonlyArray<ContractAddress>;
  readonly tickers: ReadonlyArray<Ticker>;
  readonly urls: ReadonlyArray<Url>;
}

/**
 * Result of extracting candidates (CAs, tickers, URLs) from a single message.
 *
 * Aggregate root. Id is composite `${channelId}:${messageId}`.
 *
 * This BC is pure transformation: there are no business invariants beyond
 * structural validation. The downstream parsing/normalization BCs are
 * responsible for semantic validation.
 */
export class ExtractionResult extends AggregateRoot<string> {
  private readonly state: ExtractionResultProps;

  protected constructor(id: string, props: ExtractionResultProps) {
    super(id);
    this.state = props;
  }

  public static create(input: {
    channelId: string;
    messageId: number;
    occurredAt: Date;
    rawText: string;
    contractAddresses: ReadonlyArray<ContractAddress>;
    tickers: ReadonlyArray<Ticker>;
    urls: ReadonlyArray<Url>;
  }): ExtractionResult {
    if (!input.channelId) {
      throw new DomainError(ErrorCode.VALIDATION, `channelId cannot be empty`);
    }
    if (!Number.isInteger(input.messageId) || input.messageId < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid messageId: ${input.messageId}`,
      );
    }
    return new ExtractionResult(`${input.channelId}:${input.messageId}`, {
      channelId: input.channelId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      rawText: input.rawText,
      contractAddresses: Object.freeze([...input.contractAddresses]),
      tickers: Object.freeze([...input.tickers]),
      urls: Object.freeze([...input.urls]),
    });
  }

  public get channelId(): string {
    return this.state.channelId;
  }

  public get messageId(): number {
    return this.state.messageId;
  }

  public get occurredAt(): Date {
    return this.state.occurredAt;
  }

  public get rawText(): string {
    return this.state.rawText;
  }

  public get contractAddresses(): ReadonlyArray<ContractAddress> {
    return this.state.contractAddresses;
  }

  public get tickers(): ReadonlyArray<Ticker> {
    return this.state.tickers;
  }

  public get urls(): ReadonlyArray<Url> {
    return this.state.urls;
  }

  /**
   * Emits CandidatesExtractedEvent for downstream BCs.
   * Call this once per result (typically after persistence).
   */
  public emitCandidatesExtracted(): void {
    this.apply(
      new CandidatesExtractedEvent({
        channelId: this.state.channelId,
        messageId: this.state.messageId,
        occurredAt: this.state.occurredAt,
        rawText: this.state.rawText,
        contractAddresses: this.state.contractAddresses.map((c) => ({
          value: c.value,
          chainHint: c.chainHint.value,
        })),
        tickers: this.state.tickers.map((t) => t.value),
        urls: this.state.urls.map((u) => ({
          value: u.value,
          scheme: u.scheme,
        })),
      }),
    );
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
    // ExtractionResult is pure data; no state mutation required.
  }
}
