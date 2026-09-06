import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoNewsMessageEntity } from '../entities/crypto-news-message.entity';

/**
 * TypeORM repository for crypto-news messages.
 *
 * Provides query methods for the ingestion-service to:
 * - Store incoming crypto-news messages from Telegram
 * - Serve recent messages to frontend/backend via HTTP API
 * - Check for duplicates before ingestion
 *
 * Per centralized architecture: this is the SINGLE SOURCE OF TRUTH
 * for crypto-news messages. Backend/staging/prod query this service
 * via HTTP API, they do NOT replicate the table.
 */
@Injectable()
export class CryptoNewsMessageRepository {
  constructor(
    @InjectRepository(CryptoNewsMessageEntity)
    private readonly repo: Repository<CryptoNewsMessageEntity>,
  ) {}

  /**
   * Find recent crypto-news messages, ordered by publishedAt DESC.
   * Used by the HTTP API endpoint for frontend display.
   */
  async findRecent(limit = 50): Promise<CryptoNewsMessageEntity[]> {
    return this.repo.find({
      order: { publishedAt: 'DESC' },
      take: limit,
      relations: ['media'],
    });
  }

  /**
   * Find messages by channel ID, ordered by publishedAt DESC.
   */
  async findByChannelId(
    channelId: string,
    limit = 50,
  ): Promise<CryptoNewsMessageEntity[]> {
    return this.repo.find({
      where: { channelId },
      order: { publishedAt: 'DESC' },
      take: limit,
      relations: ['media'],
    });
  }

  /**
   * Find a specific message by channel ID and message ID.
   * Returns null if not found (idempotency check for duplicate ingestion).
   */
  async findByChannelAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<CryptoNewsMessageEntity | null> {
    return this.repo.findOne({
      where: { channelId, messageId },
      relations: ['media'],
    });
  }

  /**
   * Save a crypto-news message (insert or update).
   * Media rows are saved automatically via cascade.
   */
  async save(message: CryptoNewsMessageEntity): Promise<CryptoNewsMessageEntity> {
    return this.repo.save(message);
  }

  /**
   * Count total messages in the database.
   */
  async count(): Promise<number> {
    return this.repo.count();
  }

  /**
   * Count messages by channel ID.
   */
  async countByChannelId(channelId: string): Promise<number> {
    return this.repo.count({ where: { channelId } });
  }
}
