import { Injectable, Logger } from '@nestjs/common';
import { KolReputationSummary } from 'token/scoring/domain/value-objects/kol-reputation-summary.vo';
import { KolReputationPort } from 'token/scoring/domain/ports/kol-reputation.port';
import { KolReputationRepository } from 'kol/reputation/application/ports/kol-reputation.repository';
import { KnownKolPort } from 'kol/reputation/application/ports/known-kol.port';

/**
 * KOL reputation adapter.
 *
 * Resolution order (first hit wins):
 * 1. KNOWN_BAD list (via `KnownKolPort`) → 0.1 (always)
 * 2. KNOWN_GOOD list (via `KnownKolPort`) → static default (always)
 * 3. Real historical stats (via `KolReputationRepository`) → real score (if confidence != LOW)
 * 4. Unknown KOL with no history → 0.5 (neutral)
 *
 * KNOWN_BAD overrides real stats — a known scammer stays a scammer
 * regardless of past performance.
 *
 * Fase 2 of the kol-refactor plan: the static maps moved out of the
 * adapter and into `kol/reputation/infrastructure/known-kol/`,
 * reachable via the `KnownKolPort`. The adapter no longer holds
 * hardcoded channel/handle names.
 *
 * Hot path note: `getAverageReputation` (called per token scored) used
 * to fire N parallel `findByKol` queries. It now partitions the input
 * with the in-memory `KnownKolPort` and issues a single
 * `findByIds([...])` for the unresolved bucket.
 */
@Injectable()
export class DefaultKolReputationAdapter extends KolReputationPort {
  private readonly logger = new Logger(DefaultKolReputationAdapter.name);

  public constructor(
    private readonly statsRepo: KolReputationRepository,
    private readonly knownKol: KnownKolPort,
  ) {
    super();
  }

  public async getReputation(kolId: string): Promise<KolReputationSummary> {
    if (this.knownKol.isBad(kolId)) {
      return await Promise.resolve(
        KolReputationSummary.create({ kolId, score: 0.1, mentionCount: 0 }),
      );
    }
    const goodScore = this.knownKol.getGoodScore(kolId);
    if (goodScore !== null) {
      return await Promise.resolve(
        KolReputationSummary.create({
          kolId,
          score: goodScore,
          mentionCount: 0,
        }),
      );
    }
    const stats = await this.statsRepo.findByKol(kolId);
    if (stats && stats.confidence !== 'LOW' && stats.totalCalls > 0) {
      return await Promise.resolve(
        KolReputationSummary.create({
          kolId,
          score: stats.score,
          mentionCount: stats.totalCalls,
        }),
      );
    }
    this.logger.debug(`Unknown kol, default reputation: ${kolId}`);
    return await Promise.resolve(KolReputationSummary.unknown(kolId));
  }

  public async getAverageReputation(
    kolIds: ReadonlyArray<string>,
  ): Promise<number> {
    if (kolIds.length === 0) return 0.5;

    // Partition using the sync KnownKolPort first to avoid DB hits for
    // KOLs whose score is statically known.
    const unresolved: string[] = [];
    let sum = 0;
    let counted = 0;
    for (const kolId of kolIds) {
      if (this.knownKol.isBad(kolId)) {
        sum += 0.1;
        counted += 1;
        continue;
      }
      const goodScore = this.knownKol.getGoodScore(kolId);
      if (goodScore !== null) {
        sum += goodScore;
        counted += 1;
        continue;
      }
      unresolved.push(kolId);
    }

    if (unresolved.length > 0) {
      const rows = await this.statsRepo.findByIds(unresolved);
      const byKol = new Map(rows.map((r) => [r.kolId, r]));
      for (const kolId of unresolved) {
        const stats = byKol.get(kolId);
        if (stats && stats.confidence !== 'LOW' && stats.totalCalls > 0) {
          sum += stats.score;
        } else {
          sum += 0.5; // neutral default for unknown
        }
        counted += 1;
      }
    }

    return counted === 0 ? 0.5 : sum / counted;
  }
}
