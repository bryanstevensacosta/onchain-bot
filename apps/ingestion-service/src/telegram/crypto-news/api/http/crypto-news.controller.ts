import { Controller, Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { CryptoNewsMessageRepository } from '../../infrastructure/persistence/typeorm/repositories/crypto-news-message.repository';
import { CryptoNewsSourceRepository } from '../../infrastructure/persistence/typeorm/repositories/crypto-news-source.repository';

/**
 * HTTP API for crypto-news data.
 *
 * Per centralized architecture (AGENTS.md § Ingestion-Service):
 * - Ingestion-service is the SINGLE SOURCE OF TRUTH for crypto-news data
 * - Backend staging/prod query these endpoints (no DB replication)
 * - Frontend queries these endpoints directly (no backend proxy)
 *
 * Endpoints:
 * - GET /api/crypto-news/messages — recent messages with media
 * - GET /api/crypto-news/messages/channel/:channelId — messages by channel
 * - GET /api/crypto-news/sources — all active sources
 * - GET /api/crypto-news/sources/active/ids — IDs only (backend consumer)
 */
@Controller('api/crypto-news')
export class CryptoNewsController {
  constructor(
    private readonly messageRepo: CryptoNewsMessageRepository,
    private readonly sourceRepo: CryptoNewsSourceRepository,
  ) {}

  /**
   * GET /api/crypto-news/messages?limit=50
   *
   * Returns recent crypto-news messages ordered by publishedAt DESC.
   * Media URLs are relative to ingestion-service base URL.
   *
   * Response: Array<{
   *   id: string (UUID),
   *   channelId: string,
   *   messageId: number,
   *   title: string | null,
   *   content: string,
   *   publishedAt: ISO timestamp,
   *   ingestedAt: ISO timestamp,
   *   linkPreviewUrl: string | null,
   *   linkPreviewTitle: string | null,
   *   linkPreviewDescription: string | null,
   *   linkPreviewSiteName: string | null,
   *   messageEntities: string | null (JSON),
   *   groupedId: string | null,
   *   media: Array<{
   *     id: string (UUID),
   *     messageId: string (UUID),
   *     index: number,
   *     type: 'photo' | 'video' | 'webpage',
   *     filePath: string,
   *     mimeType: string | null,
   *     fileSize: number | null,
   *     createdAt: ISO timestamp
   *   }>
   * }>
   */
  @Get('messages')
  async getRecentMessages(@Query('limit', ParseIntPipe) limit = 50) {
    const messages = await this.messageRepo.findRecent(Math.min(limit, 200));
    return messages;
  }

  /**
   * GET /api/crypto-news/messages/channel/:channelId?limit=50
   *
   * Returns messages from a specific channel.
   */
  @Get('messages/channel/:channelId')
  async getMessagesByChannel(
    @Param('channelId') channelId: string,
    @Query('limit', ParseIntPipe) limit = 50,
  ) {
    const messages = await this.messageRepo.findByChannelId(
      channelId,
      Math.min(limit, 200),
    );
    return messages;
  }

  /**
   * GET /api/crypto-news/sources
   *
   * Returns all active crypto-news sources.
   *
   * Response: Array<{
   *   channelId: string,
   *   handle: string | null,
   *   title: string,
   *   isActive: boolean,
   *   lifecycleStatus: 'ACTIVE' | 'INACTIVE',
   *   addedAt: ISO timestamp,
   *   updatedAt: ISO timestamp
   * }>
   */
  @Get('sources')
  async getSources() {
    const sources = await this.sourceRepo.findAllActive();
    return sources;
  }

  /**
   * GET /api/crypto-news/sources/active/ids
   *
   * Returns only the channel IDs of active sources (backend consumer).
   * Used by ingestion-service's BackendChannelProviderService.
   *
   * Response: Array<string> — e.g. ["-1001234567890", "-1009876543210"]
   */
  @Get('sources/active/ids')
  async getActiveSourceIds() {
    const sources = await this.sourceRepo.findAllActive();
    return sources.map((s) => s.channelId);
  }

  /**
   * GET /api/crypto-news/stats
   *
   * Returns statistics about stored crypto-news data.
   *
   * Response: {
   *   totalMessages: number,
   *   totalSources: number,
   *   activeSources: number
   * }
   */
  @Get('stats')
  async getStats() {
    const [totalMessages, sources] = await Promise.all([
      this.messageRepo.count(),
      this.sourceRepo.findAllActive(),
    ]);

    return {
      totalMessages,
      totalSources: sources.length,
      activeSources: sources.filter((s) => s.isActive).length,
    };
  }
}
