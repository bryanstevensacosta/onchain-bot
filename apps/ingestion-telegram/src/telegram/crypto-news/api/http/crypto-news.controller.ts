import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Header,
} from '@nestjs/common';
import { CryptoNewsMessageRepository } from '../../infrastructure/persistence/typeorm/repositories/crypto-news-message.repository';
import { CryptoNewsSourceRepository } from '../../infrastructure/persistence/typeorm/repositories/crypto-news-source.repository';
import { RegisterNewsSourceUseCase } from '../../application/use-cases/register-news-source.use-case';
import type { RegisterNewsSourceInput } from '../../application/use-cases/register-news-source.use-case';

/**
 * HTTP API for crypto-news data.
 *
 * **ARCHITECTURE CHANGE (2026-09-05):**
 * Ingestion-service is now the SOLE OWNER of crypto-news sources.
 * - POST /api/crypto-news/sources — CREATE new sources (ONLY here, backend deprecated)
 * - Backend POST /crypto-news/sources is now deprecated (writes nothing)
 *
 * Per centralized architecture (AGENTS.md § Ingestion-Service):
 * - Ingestion-service is the SINGLE SOURCE OF TRUTH for crypto-news data
 * - Backend staging/prod query these endpoints (no DB replication)
 * - Frontend queries these endpoints directly (no backend proxy)
 *
 * Endpoints:
 * - POST /api/crypto-news/sources — register new source (NEW - ownership migration)
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
    private readonly registerSourceUseCase: RegisterNewsSourceUseCase,
  ) {}

  /**
   * POST /api/crypto-news/sources
   *
   * Register a new Telegram channel as a crypto-news source.
   *
   * **ARCHITECTURE CHANGE (2026-09-05):**
   * This is now the ONLY endpoint that creates crypto-news sources.
   * Backend POST /crypto-news/sources is DEPRECATED (writes nothing).
   *
   * Request Body: {
   *   channelId: string,     // Required: Telegram channel ID (e.g., "-1001234567890" or "1234567890")
   *   title: string,         // Required: Channel display name
   *   handle?: string        // Optional: Channel handle (without @)
   * }
   *
   * Response: {
   *   channelId: string,           // Normalized with -100 prefix
   *   handle: string | null,
   *   title: string,
   *   isActive: boolean,           // Always true on creation
   *   lifecycleStatus: string,     // Always 'ACTIVE' on creation
   *   addedAt: string              // ISO timestamp
   * }
   *
   * Error Codes:
   * - 400 Bad Request: Invalid input (empty channelId/title, invalid format)
   * - 409 Conflict: Channel ID already registered
   *
   * Migration notes:
   * - Frontend/backend should call THIS endpoint instead of backend's
   * - Backend endpoint kept for backward compatibility but writes nothing
   * - ChannelId automatically normalized to -100 prefix format
   */
  @Post('sources')
  @HttpCode(HttpStatus.CREATED)
  async addSource(@Body() input: RegisterNewsSourceInput) {
    return this.registerSourceUseCase.execute(input);
  }

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
   *     index: number,
   *     type: 'photo' | 'video' | 'webpage',
   *     url: string,
   *     mimeType: string | null,
   *     fileSize: number | null
   *   }>
   * }>
   */
  @Get('messages')
  @Header('Cache-Control', 'no-cache, must-revalidate')
  async getRecentMessages(@Query('limit', ParseIntPipe) limit = 50) {
    const messages = await this.messageRepo.findRecent(Math.min(limit, 200));
    
    // Return object with timestamp to bust ETags on each request
    return {
      timestamp: new Date().toISOString(),
      count: messages.length,
      data: messages.map((msg) => this.transformMessageForApi(msg)),
    };
  }

  /**
   * GET /api/crypto-news/messages/channel/:channelId?limit=50
   *
   * Returns messages from a specific channel.
   */
  @Get('messages/channel/:channelId')
  @Header('Cache-Control', 'no-cache, must-revalidate')
  async getMessagesByChannel(
    @Param('channelId') channelId: string,
    @Query('limit', ParseIntPipe) limit = 50,
  ) {
    const messages = await this.messageRepo.findByChannelId(
      channelId,
      Math.min(limit, 200),
    );
    return messages.map((msg) => this.transformMessageForApi(msg));
  }

  /**
   * Transform a message entity to API response format.
   * Converts filePath to url for media items.
   * Frontend expects /ingestion-api/media URLs (proxied to this service at /api/media).
   */
  private transformMessageForApi(msg: any) {
    return {
      ...msg,
      media: msg.media.map((m: any) => ({
        id: m.id,
        index: m.index,
        type: m.type,
        url: `/ingestion-api/media/${msg.channelId}/${msg.messageId}/${m.index}`,
        mimeType: m.mimeType,
        fileSize: m.fileSize,
      })),
      // Parse messageEntities from JSON string to array for frontend
      formattingEntities: msg.messageEntities
        ? JSON.parse(msg.messageEntities)
        : undefined,
      // Remove the raw messageEntities field (it's a JSON string, not useful for frontend)
      messageEntities: undefined,
    };
  }

  /**
   * GET /api/crypto-news/sources
   *
   * Returns all crypto-news sources (including inactive ones).
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
    const sources = await this.sourceRepo.findAll();
    return sources.map((s) => ({
      channelId: s.channelId,
      handle: s.handle,
      title: s.title,
      isActive: s.isActive,
      lifecycleStatus: s.lifecycleStatus,
      addedAt: s.addedAt?.toISOString(),
      updatedAt: s.updatedAt?.toISOString(),
    }));
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
    const [totalMessages, allSources, activeSources] = await Promise.all([
      this.messageRepo.count(),
      this.sourceRepo.findAll(),
      this.sourceRepo.findAllActive(),
    ]);

    return {
      totalMessages,
      totalSources: allSources.length,
      activeSources: activeSources.length,
    };
  }

  /**
   * PATCH /api/crypto-news/sources/:channelId
   *
   * Update a crypto-news source (title and/or handle).
   *
   * Request Body: {
   *   title?: string,
   *   handle?: string
   * }
   *
   * Response: Updated source object
   *
   * Error Codes:
   * - 404 Not Found: Source not found
   * - 400 Bad Request: No fields to update
   */
  @Patch('sources/:channelId')
  async updateSource(
    @Param('channelId') channelId: string,
    @Body() updates: { title?: string; handle?: string },
  ) {
    const source = await this.sourceRepo.findByChannelId(channelId);
    if (!source) {
      throw new NotFoundException(
        `Source with channelId ${channelId} not found`,
      );
    }

    if (updates.title !== undefined) {
      source.title = updates.title.trim();
    }
    if (updates.handle !== undefined) {
      source.handle = updates.handle?.trim() || null;
    }

    const updated = await this.sourceRepo.save(source);
    return {
      channelId: updated.channelId,
      handle: updated.handle,
      title: updated.title,
      isActive: updated.isActive,
      lifecycleStatus: updated.lifecycleStatus,
      addedAt: updated.addedAt?.toISOString(),
      updatedAt: updated.updatedAt?.toISOString(),
    };
  }

  /**
   * PATCH /api/crypto-news/sources/:channelId/toggle
   *
   * Toggle the isActive state of a crypto-news source.
   *
   * Response: {
   *   channelId: string,
   *   isActive: boolean
   * }
   *
   * Error Codes:
   * - 404 Not Found: Source not found
   */
  @Patch('sources/:channelId/toggle')
  async toggleSource(@Param('channelId') channelId: string) {
    const source = await this.sourceRepo.findByChannelId(channelId);
    if (!source) {
      throw new NotFoundException(
        `Source with channelId ${channelId} not found`,
      );
    }

    source.isActive = !source.isActive;
    const updated = await this.sourceRepo.save(source);

    return {
      channelId: updated.channelId,
      isActive: updated.isActive,
    };
  }

  /**
   * DELETE /api/crypto-news/sources/:channelId
   *
   * Delete a crypto-news source.
   *
   * Response: { success: true }
   *
   * Error Codes:
   * - 404 Not Found: Source not found
   */
  @Delete('sources/:channelId')
  @HttpCode(HttpStatus.OK)
  async deleteSource(@Param('channelId') channelId: string) {
    const source = await this.sourceRepo.findByChannelId(channelId);
    if (!source) {
      throw new NotFoundException(
        `Source with channelId ${channelId} not found`,
      );
    }

    await this.sourceRepo.delete(source.channelId);
    return { success: true };
  }
}
