/**
 * @deprecated Moved to apps/kol-calls/src/extraction/ (Tramo 1, todo 5 + P18 companion).
 * Extraction per-mention now lives in kol-calls: ExtractFromMessageUseCase (direct call,
 * fix-1, no event bus; multi-tip NO collapse, one row per mention) + snapshot base emit.
 * This file stays wired for dual-run; it will be removed in todo 16 (cutover + cleanup).
 * Do not extend it — add extraction logic in apps/kol-calls/src/extraction/ instead.
 *
 * New location: apps/kol-calls/src/extraction/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Injectable } from '@nestjs/common';
import { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';
import { ExtractionResultRepository } from 'token/intake/extraction/application/ports/extraction-result.repository';

/**
 * In-memory extraction result repository.
 *
 * Bounded capacity (FIFO eviction) prevents unbounded memory growth.
 * Replace with a TypeORM/Prisma adapter for production.
 */
@Injectable()
export class InMemoryExtractionResultRepository extends ExtractionResultRepository {
  private static readonly MAX_ENTRIES = 1000;
  private readonly store = new Map<string, ExtractionResult>();

  public async save(result: ExtractionResult): Promise<void> {
    await Promise.resolve();
    this.store.set(result.id, result);
    while (this.store.size > InMemoryExtractionResultRepository.MAX_ENTRIES) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findByChannelAndMessage(
    kolId: string,
    messageId: number,
  ): Promise<ExtractionResult | null> {
    await Promise.resolve();
    return this.store.get(`${kolId}:${messageId}`) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionResult>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
}
