import { Injectable } from '@nestjs/common';
import { ScoredCall } from '../../domain/entities/scored-call.entity';
import { ScoredCallRepository } from '../../application/ports/scored-call.repository';

/**
 * In-memory scored-call store (upsert by mentionId = double-delivery
 * guard, P1 — realtime + catch-up re-delivery overwrites the same rows).
 */
@Injectable()
export class InMemoryScoredCallRepository extends ScoredCallRepository {
  private readonly rows = new Map<string, ScoredCall>();

  public async save(scored: ScoredCall): Promise<void> {
    this.rows.set(scored.mentionId, scored);
  }

  public async findByMentionId(mentionId: string): Promise<ScoredCall | null> {
    return this.rows.get(mentionId) ?? null;
  }

  public async findRecent(limit: number): Promise<ScoredCall[]> {
    return [...this.rows.values()].slice(-Math.max(0, limit));
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }
}
