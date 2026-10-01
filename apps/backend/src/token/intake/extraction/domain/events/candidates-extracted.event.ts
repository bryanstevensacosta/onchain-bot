/**
 * @deprecated Moved to apps/kol-calls/src/extraction/ (Tramo 1, todo 5 + P18 companion).
 * Extraction per-mention now lives in kol-calls: ExtractFromMessageUseCase (direct call,
 * fix-1, no event bus; multi-tip NO collapse, one row per mention) + snapshot base emit.
 * This file stays wired for dual-run; it will be removed in todo 16 (cutover + cleanup).
 * Do not extend it — add extraction logic in apps/kol-calls/src/extraction/ instead.
 *
 * New location: apps/kol-calls/src/extraction/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted by the extraction BC after successfully extracting candidates
 * from a message. Consumed by parsing, normalization, and downstream BCs.
 */
export class CandidatesExtractedEvent extends DomainEvent {
  public readonly payload: {
    readonly kolId: string;
    readonly messageId: number;
    readonly occurredAt: Date;
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
    kolId: string;
    messageId: number;
    occurredAt: Date;
    contractAddresses: ReadonlyArray<{ value: string; chainHint: string }>;
    tickers: ReadonlyArray<string>;
    urls: ReadonlyArray<{ value: string; scheme: string }>;
  }) {
    super(
      'extraction.candidates.extracted',
      `${payload.kolId}:${payload.messageId}`,
    );
    this.payload = Object.freeze(payload);
  }

  public toPayload(): Record<string, unknown> {
    return {
      kolId: this.payload.kolId,
      messageId: this.payload.messageId,
      occurredAt: this.payload.occurredAt.toISOString(),
      contractAddresses: this.payload.contractAddresses.map((c) => ({ ...c })),
      tickers: [...this.payload.tickers],
      urls: this.payload.urls.map((u) => ({ ...u })),
    };
  }
}
