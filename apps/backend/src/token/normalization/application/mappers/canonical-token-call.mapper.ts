/**
 * @deprecated Moved to apps/kol-calls/src/normalization/ (Tramo 1, todo 7 + P18 companion).
 * Normalization as mention-index now lives in kol-calls: NormalizeCallUseCase →
 * (contract, kol, messageId) index WITHOUT collapse ("one card per coin" explicitly
 * derogated per P1). This file stays wired for dual-run; it will be removed in
 * todo 16 (cutover + cleanup). Do not extend it — add normalization logic in
 * apps/kol-calls/src/normalization/ instead.
 *
 * New location: apps/kol-calls/src/normalization/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import type { CanonicalTokenCall } from 'token/normalization/domain/entities/canonical-token-call.entity';

export interface SourceView {
  readonly kolId: string;
  readonly username: string | null;
  readonly mentionCount: number;
  readonly messageIds: ReadonlyArray<number>;
}

export interface CanonicalTokenCallView {
  readonly id: string;
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly chart: string | null;
  readonly metrics: {
    readonly marketCapUsd: number | null;
    readonly liquidityUsd: number | null;
    readonly fdvUsd: number | null;
    readonly holders: number | null;
  };
  readonly sources: ReadonlyArray<SourceView>;
  readonly sourceCount: number;
  readonly mentionCount: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly confidence: number;
}

export class CanonicalTokenCallMapper {
  public static toView(call: CanonicalTokenCall): CanonicalTokenCallView {
    return {
      id: call.id,
      chain: call.identity.chain.value,
      address: call.identity.address.value,
      ticker: call.ticker,
      name: call.name,
      chart: call.chart,
      metrics: {
        marketCapUsd: call.bestMetrics.marketCapUsd,
        liquidityUsd: call.bestMetrics.liquidityUsd,
        fdvUsd: call.bestMetrics.fdvUsd,
        holders: call.bestMetrics.holders,
      },
      sources: call.sources.map((s) => ({
        kolId: s.kolId,
        username: s.username,
        mentionCount: s.mentionCount,
        messageIds: [...s.messageIds],
      })),
      sourceCount: call.sourceCount,
      mentionCount: call.mentionCount,
      firstSeenAt: call.firstSeenAt.toISOString(),
      lastSeenAt: call.lastSeenAt.toISOString(),
      confidence: call.lastConfidence,
    };
  }
}
