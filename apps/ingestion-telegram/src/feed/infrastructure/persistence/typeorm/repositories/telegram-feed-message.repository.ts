import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TelegramFeedMessageEntity,
  type TelegramFeedMessageType,
} from '../entities/telegram-feed-message.entity';

/**
 * TypeORM repository for unified feed messages (`telegram_feed_messages`).
 *
 * Mirrors `FeedMessageRepository` method-for-method (rename + `type`
 * discriminator, zero semantic change):
 * - Store incoming feed messages from Telegram
 * - Serve recent messages to frontend/backend via HTTP API
 * - Check for duplicates before ingestion
 *
 * Per centralized architecture: this is the SINGLE SOURCE OF TRUTH
 * for feed messages. Backend/staging/prod query this service
 * via HTTP API, they do NOT replicate the table.
 */
@Injectable()
export class TelegramFeedMessageRepository {
  constructor(
    @InjectRepository(TelegramFeedMessageEntity)
    private readonly repo: Repository<TelegramFeedMessageEntity>,
  ) {}

  /**
   * Find recent feed messages, ordered by publishedAt DESC.
   * Used by the HTTP API endpoint for frontend display.
   *
   * The optional `type` discriminator filters at SQL level (WHERE clause),
   * so the 200-cap (`take`) applies AFTER type filtering — a `kol`-heavy
   * feed can no longer starve `feed` reads. Omit for mixed (legacy).
   */
  async findRecent(
    limit = 50,
    type?: TelegramFeedMessageType,
  ): Promise<TelegramFeedMessageEntity[]> {
    return this.repo.find({
      where: type ? { type } : undefined,
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
  ): Promise<TelegramFeedMessageEntity[]> {
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
  ): Promise<TelegramFeedMessageEntity | null> {
    return this.repo.findOne({
      where: { channelId, messageId },
      relations: ['media'],
    });
  }

  /**
   * Save a feed message (insert or update).
   * Media rows are saved automatically via cascade.
   */
  async save(
    message: TelegramFeedMessageEntity,
  ): Promise<TelegramFeedMessageEntity> {
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
