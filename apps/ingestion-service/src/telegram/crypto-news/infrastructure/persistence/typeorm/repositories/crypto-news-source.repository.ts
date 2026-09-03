import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CryptoNewsSourceEntity } from '../entities/crypto-news-source.entity';

export interface ActiveCryptoNewsSource {
  readonly channelId: string;
  readonly title: string;
}

/**
 * Repository for querying active crypto-news sources from the database.
 *
 * Replaces the deprecated seed-based approach. Ingestion-service queries this
 * repository on startup and periodically to determine which channels require
 * media download (crypto-news channels vs KOL channels).
 *
 * Sources are created/updated via backend API (`POST /crypto-news/sources`).
 */
@Injectable()
export class CryptoNewsSourceRepository {
  private readonly logger = new Logger(CryptoNewsSourceRepository.name);

  constructor(
    @InjectRepository(CryptoNewsSourceEntity)
    private readonly repo: Repository<CryptoNewsSourceEntity>,
  ) {}

  /**
   * Find all active crypto-news sources.
   *
   * Returns channels where:
   * - lifecycleStatus = 'ACTIVE'
   * - isActive = true
   *
   * Used by the listener adapter to determine which channels should have
   * media downloaded during ingestion.
   */
  async findAllActive(): Promise<ReadonlyArray<ActiveCryptoNewsSource>> {
    try {
      const sources = await this.repo.find({
        where: {
          lifecycleStatus: 'ACTIVE',
          isActive: true,
        },
        select: ['channelId', 'title'],
      });

      this.logger.log(
        `Found ${sources.length} active crypto-news sources in DB`,
      );

      return sources.map((s) => ({
        channelId: s.channelId,
        title: s.title,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to query active crypto-news sources: ${(error as Error).message}`,
      );
      // Return empty array on DB error rather than crashing the service
      return [];
    }
  }

  /**
   * Check if a specific channel is an active crypto-news source.
   *
   * Used by the listener adapter to determine if media should be downloaded
   * for a specific incoming message.
   */
  async isActiveCryptoNewsChannel(channelId: string): Promise<boolean> {
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
        `Failed to check if ${channelId} is active crypto-news source: ${(error as Error).message}`,
      );
      // Return false on DB error to skip media download rather than crashing
      return false;
    }
  }
}
