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
