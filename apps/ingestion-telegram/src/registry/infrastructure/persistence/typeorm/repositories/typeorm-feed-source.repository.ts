import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TelegramFeedSourceEntity,
  TelegramFeedSourceType,
} from '../entities/telegram-feed-source.entity';

export interface ActiveFeedSource {
  readonly channelId: string;
  readonly title: string;
}

export interface ActiveFeedSourceWithType extends ActiveFeedSource {
  readonly type: TelegramFeedSourceType;
}

/**
 * Repository for querying the unified `telegram_feed_sources` catalog.
 *
 * Mirrors `CryptoNewsSourceRepository` semantics EXACTLY:
 * - queries fail-open (`[]` / `null` / `false`) on DB error — never crash
 *   the ingestion loop;
 * - `findAllActive` projects `select: [channelId, title]` and filters
 *   `isActive + lifecycleStatus ACTIVE`, plus an optional `type` filter;
 * - `save`/`delete` throw on DB error (write path surfaces to the caller,
 *   same as the template).
 *
 * Old `crypto_news_sources` table stays live until plan item 5 — this
 * repository reads the NEW table only.
 */
@Injectable()
export class TelegramFeedSourceRepository {
  private readonly logger = new Logger(TelegramFeedSourceRepository.name);

  constructor(
    @InjectRepository(TelegramFeedSourceEntity)
    private readonly repo: Repository<TelegramFeedSourceEntity>,
  ) {}

  /**
   * Find all active feed sources, optionally filtered by type.
   *
   * Returns channels where:
   * - lifecycleStatus = 'ACTIVE'
   * - isActive = true
   * - type = <filter> (when provided)
   */
  async findAllActive(
    type?: TelegramFeedSourceType,
  ): Promise<ReadonlyArray<ActiveFeedSource>> {
    try {
      const sources = await this.repo.find({
        where: {
          lifecycleStatus: 'ACTIVE',
          isActive: true,
          ...(type ? { type } : {}),
        },
        select: ['channelId', 'title'],
      });

      this.logger.log(
        `Found ${sources.length} active feed sources in DB${type ? ` (type=${type})` : ''}`,
      );

      return sources.map((s) => ({
        channelId: s.channelId,
        title: s.title,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to query active feed sources: ${(error as Error).message}`,
      );
      // Return empty array on DB error rather than crashing the service
      return [];
    }
  }

  /**
   * Find all active feed sources WITH their type discriminator.
   *
   * Used by CoreModule to classify messages locally by registry row type
   * (item 7: replaces the old backend-HTTP channel provider + newsIds-membership).
   * Same fail-open semantics as findAllActive: [] on DB error.
   */
  async findAllActiveWithTypes(): Promise<
    ReadonlyArray<ActiveFeedSourceWithType>
  > {
    try {
      const sources = await this.repo.find({
        where: {
          lifecycleStatus: 'ACTIVE',
          isActive: true,
        },
        select: ['channelId', 'title', 'type'],
      });

      this.logger.log(
        `Found ${sources.length} active feed sources in DB (with types)`,
      );

      return sources.map((s) => ({
        channelId: s.channelId,
        title: s.title,
        type: s.type,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to query active feed sources with types: ${(error as Error).message}`,
      );
      // Return empty array on DB error rather than crashing the service
      return [];
    }
  }

  /**
   * Find all feed sources (including inactive ones).
   *
   * Used by the API to list all sources for management UI.
   */
  async findAll(): Promise<ReadonlyArray<TelegramFeedSourceEntity>> {
    try {
      const sources = await this.repo.find({
        order: {
          addedAt: 'DESC',
        },
      });

      this.logger.log(`Found ${sources.length} total feed sources in DB`);

      return sources;
    } catch (error) {
      this.logger.error(
        `Failed to query all feed sources: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Check if a specific channel is an active feed source.
   */
  async isActiveFeedChannel(channelId: string): Promise<boolean> {
    try {
      const count = await this.repo.count({
        where: {
          channelId,
          lifecycleStatus: 'ACTIVE',
          isActive: true,
        },
      });

      return count > 0;
    } catch (error) {
      this.logger.error(
        `Failed to check if ${channelId} is active feed source: ${(error as Error).message}`,
      );
      // Return false on DB error to skip media download rather than crashing
      return false;
    }
  }

  /**
   * Find a source by channel ID.
   *
   * @param channelId - Telegram channel ID
   * @returns Source entity or null if not found
   */
  async findByChannelId(
    channelId: string,
  ): Promise<TelegramFeedSourceEntity | null> {
    try {
      const source = await this.repo.findOne({ where: { channelId } });
      return source ?? null;
    } catch (error) {
      this.logger.error(
        `Failed to find feed source by channelId ${channelId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Save (create or update) a feed source.
   *
   * @param source - Source entity to save
   * @returns Saved source entity
   */
  async save(
    source: TelegramFeedSourceEntity,
  ): Promise<TelegramFeedSourceEntity> {
    try {
      const saved = await this.repo.save(source);
      this.logger.log(`Saved feed source: ${saved.channelId} (${saved.title})`);
      return saved;
    } catch (error) {
      this.logger.error(
        `Failed to save feed source: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Create a new feed source entity (without saving).
   *
   * @param channelId - Telegram channel ID
   * @param title - Channel title
   * @param handle - Optional channel handle (without @)
   * @param type - Source discriminator (defaults to 'crypto-news')
   * @returns New source entity (not persisted)
   */
  create(
    channelId: string,
    title: string,
    handle?: string,
    type: TelegramFeedSourceType = 'crypto-news',
  ): TelegramFeedSourceEntity {
    const source = this.repo.create({
      channelId,
      title,
      handle: handle ?? null,
      type,
      isActive: true,
      lifecycleStatus: 'ACTIVE',
      lastIngestedAt: null,
    });
    return source;
  }

  /**
   * Delete a feed source by channel ID.
   *
   * @param channelId - Telegram channel ID
   */
  async delete(channelId: string): Promise<void> {
    try {
      await this.repo.delete({ channelId });
      this.logger.log(`Deleted feed source: ${channelId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete feed source ${channelId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
