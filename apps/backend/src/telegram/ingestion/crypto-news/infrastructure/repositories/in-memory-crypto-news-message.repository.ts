import { Injectable } from '@nestjs/common';
import { CryptoNewsMessage } from '../../domain/crypto-news-message.stub';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';

/**
 * In-memory implementation of CryptoNewsMessageRepository.
 * Post db-separation todo 4 this is the SOLE implementation: the backend
 * no longer persists crypto-news (ingestion-service owns the tables), so
 * there's no TypeORM variant — this in-memory shim always returns `null`
 * and exists only for DI compatibility (some legacy consumers inject the
 * port but never call its methods). Will be removed once all consumers
 * migrate to `CryptoNewsIngestionClient` (HTTP DTOs).
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
    let messages = Array.from(this.store.values());
    if (since) {
      messages = messages.filter((m) => m.ingestedAt >= since);
    }
    return messages
      .sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime())
      .slice(0, limit);
  }

  public async findByChannelId(
    channelId: string,
    limit: number,
    since?: Date,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    let messages = Array.from(this.store.values()).filter(
      (m) => m.channelId === channelId,
    );
    if (since) {
      messages = messages.filter((m) => m.ingestedAt >= since);
    }
    return messages
      .sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime())
      .slice(0, limit);
  }

  public async findByChannelAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<CryptoNewsMessage | null> {
    const found = Array.from(this.store.values()).find(
      (m) => m.channelId === channelId && m.messageId === messageId,
    );
    return found ?? null;
  }

  public async findByChannelAndGroupedId(
    channelId: string,
    groupedId: string,
  ): Promise<ReadonlyArray<CryptoNewsMessage>> {
    return Array.from(this.store.values()).filter(
      (m) => m.channelId === channelId && (m as any).groupedId === groupedId,
    );
  }
}
