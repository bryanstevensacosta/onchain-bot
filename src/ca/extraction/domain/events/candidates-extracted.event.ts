import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted by the extraction BC after successfully extracting candidates
 * from a message. Consumed by parsing, normalization, and downstream BCs.
 */
export class CandidatesExtractedEvent extends DomainEvent {
  public readonly payload: {
    readonly channelId: string;
    readonly messageId: number;
    readonly occurredAt: Date;
    readonly rawText: string;
    readonly contractAddresses: ReadonlyArray<{
      readonly value: string;
      readonly chainHint: string;
    }>;
    readonly tickers: ReadonlyArray<string>;
    readonly urls: ReadonlyArray<{
      readonly value: string;
      readonly scheme: string;
    }>;
  };

  constructor(payload: {
    channelId: string;
    messageId: number;
    occurredAt: Date;
    rawText: string;
    contractAddresses: ReadonlyArray<{ value: string; chainHint: string }>;
    tickers: ReadonlyArray<string>;
    urls: ReadonlyArray<{ value: string; scheme: string }>;
  }) {
    super(
      'extraction.candidates.extracted',
      `${payload.channelId}:${payload.messageId}`,
    );
    this.payload = Object.freeze(payload);
  }

  public toPayload(): Record<string, unknown> {
    return {
      channelId: this.payload.channelId,
      messageId: this.payload.messageId,
      occurredAt: this.payload.occurredAt.toISOString(),
      rawText: this.payload.rawText,
      contractAddresses: this.payload.contractAddresses.map((c) => ({ ...c })),
      tickers: [...this.payload.tickers],
      urls: this.payload.urls.map((u) => ({ ...u })),
    };
  }
}
