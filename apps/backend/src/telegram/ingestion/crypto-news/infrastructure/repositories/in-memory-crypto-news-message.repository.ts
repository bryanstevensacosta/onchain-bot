import { Injectable } from '@nestjs/common';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';

/**
 * In-memory implementation of CryptoNewsMessageRepository.
 * Used for tests and dev mode (when DATABASE_ENABLED=false).
 */
@Injectable()
export class InMemoryCryptoNewsMessageRepository extends CryptoNewsMessageRepository {
  private readonly store = new Map<string, CryptoNewsMessage>();

  public async save(message: CryptoNewsMessage): Promise<void> {
    this.store.set(message.id, message);
  }

  public async findById(id: string): Promise<CryptoNewsMessage | null> {
    return this.store.get(id) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    return Array.from(this.store.values())
      .sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime())
      .slice(0, limit);
  }

  public async findByChannelId(
    channelId: string,
    limit: number,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    return Array.from(this.store.values())
      .filter((m) => m.channelId === channelId)
      .sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime())
      .slice(0, limit);
  }
}
