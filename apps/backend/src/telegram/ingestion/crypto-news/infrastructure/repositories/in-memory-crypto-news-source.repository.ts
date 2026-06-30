import { Injectable } from '@nestjs/common';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';

/**
 * In-memory implementation of CryptoNewsSourceRepository.
 * Used for tests and dev mode (when DATABASE_ENABLED=false).
 */
@Injectable()
export class InMemoryCryptoNewsSourceRepository extends CryptoNewsSourceRepository {
  private readonly store = new Map<string, CryptoNewsSource>();

  public async save(source: CryptoNewsSource): Promise<void> {
    this.store.set(source.channelId, source);
  }

  public async findByChannelId(
    channelId: string,
  ): Promise<CryptoNewsSource | null> {
    return this.store.get(channelId) ?? null;
  }

  public async findAll(): Promise<ReadonlyArray<CryptoNewsSource>> {
    return Array.from(this.store.values());
  }

  public async findActive(): Promise<ReadonlyArray<CryptoNewsSource>> {
    return Array.from(this.store.values()).filter((s) => s.isActive);
  }

  public async delete(channelId: string): Promise<void> {
    this.store.delete(channelId);
  }
}
