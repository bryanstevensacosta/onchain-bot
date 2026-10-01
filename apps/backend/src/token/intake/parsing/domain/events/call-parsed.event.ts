/**
 * @deprecated Moved to apps/kol-calls/src/parsing/ (Tramo 1, todo 6 + P18 companion).
 * Parsing 1:1 now lives in kol-calls: ParseFromCandidatesUseCase → ParsedCall
 * (preserves mentions, NO collapse-to-one). This file stays wired for dual-run;
 * it will be removed in todo 16 (cutover + cleanup). Do not extend it — add parsing
 * logic in apps/kol-calls/src/parsing/ instead.
 *
 * New location: apps/kol-calls/src/parsing/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted by the parsing BC after a TokenCall is successfully parsed
 * from a Telegram message. Consumed by normalization, chain-detection,
 * and downstream BCs.
 */
export class CallParsedEvent extends DomainEvent {
  public readonly payload: {
    readonly kolId: string;
    readonly messageId: number;
    readonly occurredAt: Date;
    readonly contractAddress: string;
    readonly contractChainHint: string;
    readonly ticker: string | null;
    readonly name: string | null;
    readonly marketCapUsd: number | null;
    readonly liquidityUsd: number | null;
    readonly fdvUsd: number | null;
    readonly holders: number | null;
    readonly chart: string | null;
    readonly confidence: number;
    readonly username: string | null;
  };

  constructor(payload: {
    kolId: string;
    messageId: number;
    occurredAt: Date;
    contractAddress: string;
    contractChainHint: string;
    ticker: string | null;
    name: string | null;
    marketCapUsd: number | null;
    liquidityUsd: number | null;
    fdvUsd: number | null;
    holders: number | null;
    chart: string | null;
    confidence: number;
    username: string | null;
  }) {
    super('parsing.call.parsed', `${payload.kolId}:${payload.messageId}`);
    this.payload = Object.freeze(payload);
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      occurredAt: this.payload.occurredAt.toISOString(),
    };
  }
}
