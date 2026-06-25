import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';
import { ContractAddress } from 'token/identity/contract-address.vo';
import { Ticker } from 'token/intake/extraction/domain/value-objects/ticker.vo';
import { Url } from 'token/intake/extraction/domain/value-objects/url.vo';
import { CandidatesExtractedEvent } from 'token/intake/extraction/domain/events/candidates-extracted.event';

interface ExtractionResultProps {
  readonly kolId: string;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly contractAddresses: ReadonlyArray<ContractAddress>;
  readonly tickers: ReadonlyArray<Ticker>;
  readonly urls: ReadonlyArray<Url>;
}

/**
 * Result of extracting candidates (CAs, tickers, URLs) from a single message.
 *
 * Aggregate root. Id is composite `${kolId}:${messageId}`.
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
    kolId: string;
    messageId: number;
    occurredAt: Date;
    contractAddresses: ReadonlyArray<ContractAddress>;
    tickers: ReadonlyArray<Ticker>;
    urls: ReadonlyArray<Url>;
  }): ExtractionResult {
    if (!input.kolId) {
      throw new DomainError(ErrorCode.VALIDATION, `kolId cannot be empty`);
    }
    if (!Number.isInteger(input.messageId) || input.messageId < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid messageId: ${input.messageId}`,
      );
    }
    return new ExtractionResult(`${input.kolId}:${input.messageId}`, {
      kolId: input.kolId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      contractAddresses: Object.freeze([...input.contractAddresses]),
      tickers: Object.freeze([...input.tickers]),
      urls: Object.freeze([...input.urls]),
    });
  }

  /**
   * Reconstruct an aggregate from persistence. Bypasses factory validation
   * — assumes the DB stored a coherent state.
   */
  public static rehydrate(input: {
    id: string;
    kolId: string;
    messageId: number;
    occurredAt: Date;
    contractAddresses: ReadonlyArray<ContractAddress>;
    tickers: ReadonlyArray<Ticker>;
    urls: ReadonlyArray<Url>;
  }): ExtractionResult {
    return new ExtractionResult(input.id, {
      kolId: input.kolId,
      messageId: input.messageId,
      occurredAt: input.occurredAt,
      contractAddresses: input.contractAddresses,
      tickers: input.tickers,
      urls: input.urls,
    });
  }

  public get kolId(): string {
    return this.state.kolId;
  }

  public get messageId(): number {
    return this.state.messageId;
  }

  public get occurredAt(): Date {
    return this.state.occurredAt;
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
        kolId: this.state.kolId,
        messageId: this.state.messageId,
        occurredAt: this.state.occurredAt,
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
