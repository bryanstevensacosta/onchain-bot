import type { KolConfidence } from 'kol/reputation/domain/value-objects/kol-reputation.vo';

export interface KolReputationStats {
  readonly totalMentions: number;
  readonly distinctTokens: number;
  readonly firstSeenAt: Date | null;
  readonly lastSeenAt: Date | null;
}

interface KolReputationCanonicalCallSource {
  readonly kolId: string | number;
  readonly mentionCount?: number;
  readonly messageIds?: ReadonlyArray<number>;
}

interface KolReputationCanonicalCall {
  readonly chain: string;
  readonly address: string;
  readonly sources: ReadonlyArray<KolReputationCanonicalCallSource>;
  readonly lastSeenAt: Date;
}

/**
 * KolReputationAggregator — counts a KOL's mention volume across all
 * canonical token calls.
 *
 * Reads each canonical call's `sources` JSONB array (populated by
 * `telegram/kol-calls-ingestion`) and tallies per-KOL stats. This is
 * the fallback data source — always available, regardless of whether
 * `CallPerformance` (which requires `call/lifecycle` to run) has data.
 *
 * Once `call/lifecycle` produces `CallMilestoneUnlockedEvent`s, those
 * feed into `KolReputationAthStats` and the two are combined by
 * `KolReputationCalculator`.
 */
export class KolReputationAggregator {
  public static aggregate(
    kolId: string,
    calls: ReadonlyArray<KolReputationCanonicalCall>,
  ): KolReputationStats {
    const targetKolId = String(kolId);
    let totalMentions = 0;
    const distinctTokens = new Set<string>();
    let firstSeenAt: Date | null = null;
    let lastSeenAt: Date | null = null;

    for (const call of calls) {
      if (!Array.isArray(call.sources)) continue;
      for (const source of call.sources) {
        if (String(source.kolId) !== targetKolId) continue;
        totalMentions += source.mentionCount ?? 1;
        distinctTokens.add(`${call.chain}:${call.address.toLowerCase()}`);
        if (call.lastSeenAt) {
          if (!firstSeenAt || call.lastSeenAt < firstSeenAt) {
            firstSeenAt = call.lastSeenAt;
          }
          if (!lastSeenAt || call.lastSeenAt > lastSeenAt) {
            lastSeenAt = call.lastSeenAt;
          }
        }
      }
    }

    return {
      totalMentions,
      distinctTokens: distinctTokens.size,
      firstSeenAt,
      lastSeenAt,
    };
  }
}