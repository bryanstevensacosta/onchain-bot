import { Injectable } from '@nestjs/common';
import { ExtractionResult } from 'discovery/extraction/domain/entities/extraction-result.entity';
import { ExtractionResultRepository } from 'discovery/extraction/application/ports/extraction-result.repository';

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
    channelId: string,
    messageId: number,
  ): Promise<ExtractionResult | null> {
    await Promise.resolve();
    return this.store.get(`${channelId}:${messageId}`) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionResult>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
}
