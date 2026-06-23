import { Injectable } from '@nestjs/common';
import { KolReputation } from 'telegram-kol/reputation/domain/value-objects/kol-reputation.vo';
import { KolReputationRepository } from 'telegram-kol/reputation/application/ports/kol-reputation.repository';

/**
 * In-memory implementation of KolReputationRepository.
 *
 * Bounded FIFO eviction at 5,000 entries. Replaced by TypeORM in
 * production. Critical for keeping scoring multiplies stable when a
 * burst of new KOLs would otherwise evict active ones.
 */
@Injectable()
export class InMemoryKolReputationRepository extends KolReputationRepository {
  private static readonly MAX_ENTRIES = 5000;
  private readonly store = new Map<string, KolReputation>();

  public async save(stats: KolReputation): Promise<void> {
    await Promise.resolve();
    this.store.set(stats.kolId, stats);
    while (this.store.size > InMemoryKolReputationRepository.MAX_ENTRIES) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findByKol(kolId: string): Promise<KolReputation | null> {
    await Promise.resolve();
    return this.store.get(kolId) ?? null;
  }

  public async findByIds(
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<KolReputation>> {
    await Promise.resolve();
    if (ids.length === 0) return [];
    const wanted = new Set(ids);
    const out: KolReputation[] = [];
    for (const [id, rep] of this.store) {
      if (wanted.has(id)) out.push(rep);
    }
    return out;
  }

  public async findAll(): Promise<ReadonlyArray<KolReputation>> {
    await Promise.resolve();
    return Array.from(this.store.values()).sort((a, b) => b.score - a.score);
  }

  public async findTop(
    limit: number,
    minConfidence?: KolReputation['confidence'],
  ): Promise<ReadonlyArray<KolReputation>> {
    await Promise.resolve();
    const confidenceOrder: Record<string, number> = {
      LOW: 0,
      MEDIUM: 1,
      HIGH: 2,
      VERY_HIGH: 3,
    };
    const minOrder = minConfidence ? confidenceOrder[minConfidence] : 0;
    return Array.from(this.store.values())
      .filter((s) => confidenceOrder[s.confidence] >= minOrder)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
