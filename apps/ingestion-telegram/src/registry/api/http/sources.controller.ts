import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TelegramFeedSourceRepository } from '../../infrastructure/persistence/typeorm/repositories/typeorm-feed-source.repository';
import type { TelegramFeedSourceType } from '../../infrastructure/persistence/typeorm/entities/telegram-feed-source.entity';
import { kolAvatarUrlFor } from '../../../avatar/avatar.constants';
import {
  RegisterNewsSourceUseCase,
  type RegisterFeedSourceBatchInput,
  type RegisterNewsSourceInput,
} from '../../application/use-cases/register-news-source.use-case';

const VALID_TYPES: ReadonlyArray<TelegramFeedSourceType> = [
  'kol',
  'crypto-news',
];

function parseTypeFilter(
  type: string | undefined,
): TelegramFeedSourceType | undefined {
  if (type === undefined) {
    return undefined;
  }
  if (!VALID_TYPES.includes(type as TelegramFeedSourceType)) {
    throw new BadRequestException(
      `type must be one of ${VALID_TYPES.join(', ')}`,
    );
  }
  return type as TelegramFeedSourceType;
}

/**
 * HTTP API for the unified feed source catalog.
 *
 * Ingestion-service is the SOLE OWNER of feed sources
 * (`telegram_feed_sources`: `kol` + `feed` rows).
 *
 * Routes (ported 1:1 from the retired feed controller):
 * - POST /api/feed/sources — register new source (201/409/400)
 * - POST /api/feed/sources/batch — idempotent upsert by channel_id (backfill)
 * - GET /api/feed/sources[?type=] — all sources (including inactive)
 * - GET /api/feed/sources/active/ids[?type=] — IDs only (backend consumer)
 * - PATCH /api/feed/sources/:channelId — update title/handle
 * - PATCH /api/feed/sources/:channelId/toggle — flip isActive
 * - DELETE /api/feed/sources/:channelId — delete source
 */
@ApiTags('feed')
@Controller(['api/feed', 'api/crypto-news'])
export class SourcesController {
  constructor(
    private readonly sourceRepo: TelegramFeedSourceRepository,
    private readonly registerSourceUseCase: RegisterNewsSourceUseCase,
  ) {}

  @Post('sources')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Register a Telegram channel as a feed source (sole owner endpoint)',
  })
  @ApiResponse({ status: 201, description: 'Source registered' })
  @ApiResponse({ status: 400, description: 'Invalid channelId format' })
  @ApiResponse({ status: 409, description: 'Channel already registered' })
  async addSource(@Body() input: RegisterNewsSourceInput) {
    return this.registerSourceUseCase.execute(input);
  }

  @Post('sources/batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Idempotent batch upsert of feed sources by channel_id (backfill)',
  })
  @ApiResponse({
    status: 201,
    description: 'Batch upserted (created/updated/total)',
  })
  @ApiResponse({ status: 400, description: 'Invalid batch payload' })
  async batchUpsert(@Body() input: RegisterFeedSourceBatchInput) {
    return this.registerSourceUseCase.executeBatch(input);
  }

  @Get('sources')
  @ApiOperation({
    summary: 'All feed sources (including inactive), optional type filter',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by source type (kol|crypto-news)',
  })
  @ApiResponse({ status: 200, description: 'All sources' })
  async getSources(@Query('type') type?: string) {
    const typeFilter = parseTypeFilter(type);
    const sources = await this.sourceRepo.findAll();
    return sources
      .filter((s) => !typeFilter || s.type === typeFilter)
      .map((s) => ({
        channelId: s.channelId,
        handle: s.handle,
        title: s.title,
        type: s.type,
        isActive: s.isActive,
        lifecycleStatus: s.lifecycleStatus,
        addedAt: s.addedAt?.toISOString(),
        updatedAt: s.updatedAt?.toISOString(),
        // P19: permanent avatar URL (file-or-placeholder, always servable).
        avatarUrl: kolAvatarUrlFor(s.channelId),
      }));
  }

  @Get('sources/active/ids')
  @ApiOperation({
    summary:
      'Active source channel ids (backend consumer), optional type filter',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by source type (kol|crypto-news)',
  })
  @ApiResponse({ status: 200, description: 'Array of channel ids' })
  async getActiveSourceIds(@Query('type') type?: string) {
    const typeFilter = parseTypeFilter(type);
    const sources = await this.sourceRepo.findAllActive(typeFilter);
    return sources.map((s) => s.channelId);
  }

  @Patch('sources/:channelId')
  @ApiOperation({ summary: 'Update a feed source title/handle' })
  @ApiParam({ name: 'channelId', description: 'Telegram channel id' })
  @ApiResponse({ status: 200, description: 'Source updated' })
  @ApiResponse({ status: 400, description: 'No fields to update' })
  @ApiResponse({ status: 404, description: 'Unknown channel id' })
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
      type: updated.type,
      isActive: updated.isActive,
      lifecycleStatus: updated.lifecycleStatus,
      addedAt: updated.addedAt?.toISOString(),
      updatedAt: updated.updatedAt?.toISOString(),
      avatarUrl: kolAvatarUrlFor(updated.channelId),
    };
  }

  @Patch('sources/:channelId/toggle')
  @ApiOperation({ summary: 'Toggle a feed source active/inactive' })
  @ApiParam({ name: 'channelId', description: 'Telegram channel id' })
  @ApiResponse({ status: 200, description: 'Source toggled' })
  @ApiResponse({ status: 404, description: 'Unknown channel id' })
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
      avatarUrl: kolAvatarUrlFor(updated.channelId),
    };
  }

  @Delete('sources/:channelId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a feed source' })
  @ApiParam({ name: 'channelId', description: 'Telegram channel id' })
  @ApiResponse({ status: 200, description: 'Source deleted' })
  @ApiResponse({ status: 404, description: 'Unknown channel id' })
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
