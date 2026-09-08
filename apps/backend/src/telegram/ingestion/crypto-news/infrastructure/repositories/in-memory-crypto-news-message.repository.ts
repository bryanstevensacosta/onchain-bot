import { Injectable } from '@nestjs/common';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';

/**
 * In-memory implementation of CryptoNewsMessageRepository.
 * Post db-separation todo 4 this is the SOLE implementation: the backend
 * no longer persists crypto-news (ingestion-service owns the tables), so
 * the store stays empty and lookups return null/[].
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
    since?: Date,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    return Array.from(this.store.values())
      .filter((m) => (since ? m.ingestedAt.getTime() >= since.getTime() : true))
      .sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime())
      .slice(0, limit);
  }

  public async findByChannelId(
    channelId: string,
    limit: number,
    since?: Date,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    return Array.from(this.store.values())
      .filter(
        (m) =>
          m.channelId === channelId &&
          (since ? m.ingestedAt.getTime() >= since.getTime() : true),
      )
      .sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime())
      .slice(0, limit);
  }

  public async findByChannelAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<CryptoNewsMessage | null> {
    for (const m of this.store.values()) {
      if (m.channelId === channelId && m.messageId === messageId) {
        return m;
      }
    }
    return null;
  }

  public async findByChannelAndGroupedId(
    channelId: string,
    groupedId: string,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    return Array.from(this.store.values())
      .filter((m) => m.channelId === channelId && m.groupedId === groupedId)
      .sort((a, b) => a.messageId - b.messageId);
  }
}
