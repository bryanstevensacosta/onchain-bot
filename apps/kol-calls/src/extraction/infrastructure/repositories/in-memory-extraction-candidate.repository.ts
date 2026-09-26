import { Injectable } from '@nestjs/common';
import { ExtractionCandidate } from '../../domain/entities/extraction-candidate.entity';

/**
 * In-memory ExtractionCandidate store.
 *
 * Keyed by the deterministic candidate id (`kolId:messageId:index`), so
 * `save` is an upsert: realtime + catch-up double-delivery of the same
 * message overwrites the same rows instead of duplicating them. That
 * upsert is the ONLY guard in this layer (P1) — repeats WITHIN a message
 * carry distinct indexes and are all kept.
 */
@Injectable()
export class InMemoryExtractionCandidateRepository {
  private readonly rows = new Map<string, ExtractionCandidate>();

  public async save(candidate: ExtractionCandidate): Promise<void> {
    this.rows.set(candidate.id, candidate);
  }

  public async findByMessage(
    kolId: string,
    messageId: number,
  ): Promise<ReadonlyArray<ExtractionCandidate>> {
    return [...this.rows.values()]
      .filter((c) => c.kolId === kolId && c.messageId === messageId)
      .sort((a, b) => a.contractIndex - b.contractIndex);
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionCandidate>> {
    return [...this.rows.values()].slice(-limit).reverse();
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }

  public clear(): void {
    this.rows.clear();
  }
}
