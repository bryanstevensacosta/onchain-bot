import { Injectable } from '@nestjs/common';
import { ParsedCall } from '../../domain/entities/parsed-call.entity';
import { ParsedCallRepository } from '../../application/ports/parsed-call.repository';

/**
 * In-memory ParsedCall store.
 *
 * Keyed by the deterministic parsed id (`kolId:messageId:contractIndex`,
 * inherited from the candidate), so `save` is an upsert: double-delivery
 * of the same message overwrites the same rows instead of duplicating
 * them. That upsert is the ONLY guard in this layer (P1) — distinct
 * mentions carry distinct indexes and are all kept.
 */
@Injectable()
export class InMemoryParsedCallRepository extends ParsedCallRepository {
  private readonly rows = new Map<string, ParsedCall>();

  public async save(call: ParsedCall): Promise<void> {
    this.rows.set(call.id, call);
  }

  public async findByMessage(
    kolId: string,
    messageId: number,
  ): Promise<ReadonlyArray<ParsedCall>> {
    return [...this.rows.values()]
      .filter((c) => c.kolId === kolId && c.messageId === messageId)
      .sort((a, b) => a.contractIndex - b.contractIndex);
  }

  public async findRecent(limit: number): Promise<ReadonlyArray<ParsedCall>> {
    return [...this.rows.values()].slice(-limit).reverse();
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }

  public clear(): void {
    this.rows.clear();
  }
}
