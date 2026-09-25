import { Injectable } from '@nestjs/common';
import { NormalizedMention } from '../../domain/entities/normalized-mention.entity';
import { NormalizedMentionRepository } from '../../application/ports/normalized-mention.repository';

/**
 * In-memory NormalizedMention store.
 *
 * Keyed by the deterministic mention id
 * (`chain:address:kolId:messageId:contractIndex`), so `save` is an upsert:
 * double-delivery of the same message overwrites the same rows instead of
 * duplicating them. That upsert is the ONLY guard in this layer (P1) —
 * distinct mentions carry distinct keys and are all kept.
 */
@Injectable()
export class InMemoryNormalizedMentionRepository extends NormalizedMentionRepository {
  private readonly rows = new Map<string, NormalizedMention>();

  public async save(mention: NormalizedMention): Promise<void> {
    this.rows.set(mention.id, mention);
  }

  public async findByMessage(
    kolId: string,
    messageId: number,
  ): Promise<ReadonlyArray<NormalizedMention>> {
    return [...this.rows.values()]
      .filter((m) => m.kolId === kolId && m.messageId === messageId)
      .sort((a, b) => a.contractIndex - b.contractIndex);
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<NormalizedMention>> {
    return [...this.rows.values()].slice(-limit).reverse();
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }

  public clear(): void {
    this.rows.clear();
  }
}
