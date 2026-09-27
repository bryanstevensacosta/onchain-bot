import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Optional,
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
import { TelegramListenerPort } from 'core/ports/telegram-listener.port';
import {
  kolAvatarUrlFor,
  sourceUrlFor,
} from '../../../avatar/avatar.constants';
import { KolAvatarService } from '../../../avatar/kol-avatar.service';
import {
  normalizeResolveInput,
  SUBSCRIBABLE_KINDS,
} from '../../application/entity-kind';
import {
  RegisterNewsSourceUseCase,
  type RegisterFeedSourceBatchInput,
  type RegisterNewsSourceInput,
} from '../../application/use-cases/register-news-source.use-case';
import type { MetadataKind } from 'metadata/metadata-kind';
// Value import (not `import type`): emitDecoratorMetadata must see the
// runtime class or Nest resolves the @Optional() param to null.
import { MetadataService } from 'metadata/metadata.service';

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
 * - GET /api/feed/sources/resolve?input=@handle|id|t.me — entity kind probe (P57)
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
    private readonly telegramListener: TelegramListenerPort,
    @Optional() private readonly avatars?: KolAvatarService,
    @Optional() private readonly metadata?: MetadataService,
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

  @Get('sources/resolve')
  @ApiOperation({
    summary:
      'Resolve a Telegram entity kind (@handle|id|t.me) via single getEntity (P57)',
  })
  @ApiQuery({
    name: 'input',
    required: true,
    description: 'Telegram @handle, numeric id, or t.me URL to classify',
  })
  @ApiResponse({
    status: 200,
    description: 'Entity kind + subscribability',
  })
  @ApiResponse({ status: 400, description: 'Empty input or invite link' })
  @ApiResponse({ status: 404, description: 'Entity not found / not visible' })
  async resolveSource(@Query('input') input: string) {
    const normalized = normalizeResolveInput(input ?? '');
    let metadata;
    try {
      metadata = await this.telegramListener.resolveChannelMetadata(normalized);
    } catch (error) {
      throw new NotFoundException(
        `Cannot resolve "${normalized}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const kind = metadata.kind ?? 'unknown';
    return {
      input: normalized,
      kind,
      canSubscribe: (SUBSCRIBABLE_KINDS as ReadonlyArray<string>).includes(
        kind,
      ),
      channelId: metadata.peerId,
      title: metadata.title,
      handle: metadata.handle,
      isBot: metadata.isBot ?? false,
      // P57: same display enrichments as the stored source views.
      avatarUrl: kolAvatarUrlFor(metadata.peerId),
      url: sourceUrlFor(metadata.handle),
    };
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
        // P57: public t.me URL (stored column, display fallback by handle).
        url: s.url ?? sourceUrlFor(s.handle),
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
      const nextHandle = updates.handle?.trim() || null;
      if (nextHandle !== source.handle) {
        source.handle = nextHandle;
        source.url = sourceUrlFor(nextHandle);
        // P57: renames the avatar file to the handle-qualified form
        // (best-effort, never fails the PATCH).
        try {
          this.avatars?.migrateFilename(source.channelId, nextHandle);
        } catch {
          // migrateFilename never throws; defense in depth.
        }
      }
    }

    const updated = await this.sourceRepo.save(source);
    // P58 dual-write: mirror identity edits into metadata by id (best-effort).
    if (this.metadata) {
      void this.metadata
        .adoptRegistryRow(updated.channelId, {
          handle: updated.handle,
          title: updated.title,
          kind:
            ((updated as { entityKind?: string | null })
              .entityKind as MetadataKind | null) ?? null,
          isBot: (updated as { isBot?: boolean | null }).isBot ?? null,
        })
        .catch(() => undefined);
    }
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
      url: updated.url ?? sourceUrlFor(updated.handle),
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
      url: updated.url ?? sourceUrlFor(updated.handle),
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
