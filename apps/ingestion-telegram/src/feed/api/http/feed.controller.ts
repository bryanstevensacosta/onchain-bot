import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TelegramFeedMessageRepository } from '../../infrastructure/persistence/typeorm/repositories/telegram-feed-message.repository';
import { TelegramFeedSourceRepository } from 'registry/infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';

/**
 * Normalize the `message_entities` column to an entity array.
 *
 * Post-migration the column is `jsonb` (already parsed by the driver);
 * pre-migration TEXT rows arrive as JSON strings. `''`/unparseable
 * strings fall back to `[]` so mixed-version rows never break the API.
 */
export function parseMessageEntities(
  value: unknown,
): Array<{ type: string; offset: number; length: number; url?: string }> | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    if (value === '') return [];
    try {
      return JSON.parse(value) as Array<{
        type: string;
        offset: number;
        length: number;
        url?: string;
      }>;
    } catch {
      return [];
    }
  }
  return value as Array<{
    type: string;
    offset: number;
    length: number;
    url?: string;
  }>;
}

/**
 * HTTP API for unified feed reads (messages + stats).
 *
 * Source CRUD lives in `SourcesController` (registry/); this controller
 * serves the hot data from `telegram_feed_messages`:
 * - GET /api/feed/messages — recent messages with media
 * - GET /api/feed/messages/channel/:channelId — messages by channel
 * - GET /api/feed/stats — message/source counts
 *
 * Response shapes are ported 1:1 from the retired crypto-news controller
 * (wrapped `{timestamp,count,data}` on the recent-messages read, bare
 * arrays on the channel read).
 */
@ApiTags('feed')
@Controller('api/feed')
export class FeedController {
  constructor(
    private readonly messageRepo: TelegramFeedMessageRepository,
    private readonly sourceRepo: TelegramFeedSourceRepository,
  ) {}

  @Get('messages')
  @Header('Cache-Control', 'no-cache, must-revalidate')
  @ApiOperation({ summary: 'Recent feed messages with media (RAW content, no filters)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max messages (default 50, capped at 200)' })
  @ApiResponse({ status: 200, description: 'Recent messages with timestamp/count/data' })
  async getRecentMessages(@Query('limit', ParseIntPipe) limit = 50) {
    const messages = await this.messageRepo.findRecent(Math.min(limit, 200));

    // Return object with timestamp to bust ETags on each request
    return {
      timestamp: new Date().toISOString(),
      count: messages.length,
      data: messages.map((msg) => this.transformMessageForApi(msg)),
    };
  }

  @Get('messages/channel/:channelId')
  @Header('Cache-Control', 'no-cache, must-revalidate')
  @ApiOperation({ summary: 'Messages from one channel' })
  @ApiParam({ name: 'channelId', description: 'Telegram channel id' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max messages (default 50, capped at 200)' })
  @ApiResponse({ status: 200, description: 'Channel messages' })
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
      // Parse messageEntities to an array for frontend. Post-migration the
      // column is jsonb (node-pg returns a parsed array); pre-migration TEXT
      // rows come back as JSON strings — accept both during rollout.
      formattingEntities: parseMessageEntities(msg.messageEntities),
      // Remove the raw messageEntities field (either shape is internal)
      messageEntities: undefined,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Stored feed statistics' })
  @ApiResponse({ status: 200, description: 'Message/source counts' })
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
}
