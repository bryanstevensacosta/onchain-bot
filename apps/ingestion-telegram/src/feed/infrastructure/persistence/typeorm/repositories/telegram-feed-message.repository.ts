import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TelegramFeedMessageEntity,
  type TelegramFeedMessageType,
} from '../entities/telegram-feed-message.entity';
import { encodeFeedCursor, type FeedCursor } from 'feed/feed-cursor';

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
   * Find a page of recent feed messages using a keyset cursor.
   *
   * Ordering is `publishedAt DESC, id DESC` (the `id` tie-breaker keeps
   * pages deterministic when rows share a timestamp). The cursor is the
   * opaque `nextCursor` of the previous page; omit it for the first page.
   * New rows ingested between pages sort BEFORE the anchor, so in-flight
   * pages neither duplicate nor skip older rows (cursor stability).
   *
   * No offsets: the query is keyed on `(publishedAt, id)`, so page N never
   * re-scans or skips rows when the table grows mid-pagination.
   *
   * Fetches `limit + 1` rows: the extra row proves a next page exists and
   * is dropped. `nextCursor` is `null` on the last page.
   */
  async findRecentPaged(
    limit = 50,
    type?: TelegramFeedMessageType,
    cursor?: FeedCursor,
  ): Promise<{ rows: TelegramFeedMessageEntity[]; nextCursor: string | null }> {
    const qb = this.repo
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.media', 'media')
      .orderBy('msg.publishedAt', 'DESC')
      .addOrderBy('msg.id', 'DESC')
      .take(limit + 1);
    if (type) {
      qb.andWhere('msg.type = :type', { type });
    }
    if (cursor) {
      qb.andWhere(
        '(msg.publishedAt < :cursorPublishedAt OR (msg.publishedAt = :cursorPublishedAt AND msg.id < :cursorId))',
        { cursorPublishedAt: cursor.publishedAt, cursorId: cursor.id },
      );
    }
    const fetched = await qb.getMany();
    if (fetched.length <= limit) {
      return { rows: fetched, nextCursor: null };
    }
    const rows = fetched.slice(0, limit);
    const last = rows[rows.length - 1];
    if (!last) {
      return { rows, nextCursor: null };
    }
    return { rows, nextCursor: encodeFeedCursor(last.publishedAt, last.id) };
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
