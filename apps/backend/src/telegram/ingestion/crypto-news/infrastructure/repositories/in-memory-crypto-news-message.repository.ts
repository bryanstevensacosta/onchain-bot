import { Injectable } from '@nestjs/common';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsMessageMediaEntity } from 'telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity';

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

  /**
   * Intended O(n*m) lookup over `store.values()` × message.media, but
   * `CryptoNewsMedia` VOs do NOT carry the UUID assigned by the DB row,
   * so a `mediaId` (UUID) cannot be matched to any stored media item.
   * Always returns `null` — the binary-serve endpoint (T7) will
   * respond 404 when backed by the in-memory repo. The TypeORM adapter
   * performs the real lookup. Acceptable for dev/testing only.
   */
  public async findMediaById(
    _mediaId: string,
  ): Promise<CryptoNewsMessageMediaEntity | null> {
    return null;
  }
}
