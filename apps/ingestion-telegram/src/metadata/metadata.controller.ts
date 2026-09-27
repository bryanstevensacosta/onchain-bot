import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createReadStream, statSync } from 'fs';
import type { Response } from 'express';
import { MetadataService } from './metadata.service';
import {
  METADATA_AVATAR_CONTENT_TYPE,
  METADATA_AVATAR_PLACEHOLDER_CONTENT_TYPE,
  METADATA_AVATAR_PLACEHOLDER_SVG,
  sanitizeAvatarChannelId,
} from './metadata.constants';

/**
 * Central channel-metadata HTTP API (P58 `metadata/` BC).
 *
 * Canonical owner of identity per id (kind/handle/photo/url/type):
 * - `GET /api/metadata/:channelId` — public identity view (never `phone`)
 * - `GET /api/metadata/:channelId/avatar` — canonical avatar serve
 *   (successor of the deprecated `GET /api/kol-avatar/:channelId`)
 * - `POST /api/metadata/:channelId/refresh` — explicit manual refresh
 *   (identity re-resolve + photo re-fetch, guarded; protected)
 * - `POST /api/metadata/backfill` — catch-up for pre-metadata rows
 *   (adopt + fetch-once, serialized, never throws; protected)
 *
 * Read-only consumers (feed/stream/media/core) project through the views
 * here; they hold no local copies of handle/photo.
 */
@ApiTags('metadata')
@Controller('api/metadata')
export class MetadataController {
  public constructor(private readonly metadata: MetadataService) {}

  @Post('backfill')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Backfill metadata + avatars for rows missing them (fetch-once)',
  })
  @ApiResponse({ status: 201, description: 'Backfill totals' })
  public async backfillMetadata(): Promise<{
    checked: number;
    fetched: number;
    cached: number;
    placeholder: number;
  }> {
    return this.metadata.backfillMissing();
  }

  @Get(':channelId')
  @ApiOperation({ summary: 'Channel identity view (kind/handle/url/type)' })
  @ApiParam({ name: 'channelId', description: 'Telegram channel id' })
  @ApiResponse({ status: 200, description: 'Identity view (never phone)' })
  @ApiResponse({ status: 400, description: 'Invalid channelId' })
  @ApiResponse({ status: 404, description: 'Unknown channel id' })
  public async getMetadata(@Param('channelId') channelId: string) {
    const clean = sanitizeAvatarChannelId(channelId);
    if (clean.length === 0) {
      throw new BadRequestException(
        `Invalid channelId: ${channelId}. Must contain alphanumeric characters`,
      );
    }
    const view = await this.metadata.getView(channelId);
    if (!view) {
      throw new NotFoundException(
        `No channel metadata for ${channelId}: register the source first (POST /api/feed/sources)`,
      );
    }
    return view;
  }

  @Get(':channelId/avatar')
  @ApiOperation({ summary: 'Serve a channel avatar (or placeholder)' })
  @ApiParam({ name: 'channelId', description: 'Telegram channel id' })
  @ApiResponse({ status: 200, description: 'Avatar bytes or placeholder SVG' })
  @ApiResponse({ status: 400, description: 'Invalid channelId' })
  public async serveAvatar(
    @Param('channelId') channelId: string,
    @Res() response: Response,
  ): Promise<void> {
    const clean = sanitizeAvatarChannelId(channelId);
    if (clean.length === 0) {
      throw new BadRequestException(
        `Invalid channelId: ${channelId}. Must contain alphanumeric characters`,
      );
    }
    const filePath = this.metadata.findAvatarFile(channelId);
    if (filePath) {
      let size = 0;
      try {
        size = statSync(filePath).size;
      } catch {
        this.sendPlaceholder(response);
        return;
      }
      response.setHeader('Content-Type', METADATA_AVATAR_CONTENT_TYPE);
      response.setHeader('Content-Length', String(size));
      response.setHeader('Cache-Control', 'public, max-age=31536000');
      createReadStream(filePath).pipe(response);
      return;
    }
    this.sendPlaceholder(response);
  }

  @Post(':channelId/refresh')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Explicit manual metadata refresh (guarded)' })
  @ApiParam({ name: 'channelId', description: 'Telegram channel id' })
  @ApiResponse({ status: 201, description: 'Refresh outcome' })
  @ApiResponse({ status: 400, description: 'Invalid channelId' })
  public async refreshMetadata(
    @Param('channelId') channelId: string,
    @Query('handle') handle?: string,
  ) {
    const clean = sanitizeAvatarChannelId(channelId);
    if (clean.length === 0) {
      throw new BadRequestException(
        `Invalid channelId: ${channelId}. Must contain alphanumeric characters`,
      );
    }
    return this.metadata.refreshMetadata(channelId, handle ?? null);
  }

  private sendPlaceholder(response: Response): void {
    const body = METADATA_AVATAR_PLACEHOLDER_SVG;
    response.setHeader(
      'Content-Type',
      METADATA_AVATAR_PLACEHOLDER_CONTENT_TYPE,
    );
    response.setHeader('Content-Length', String(Buffer.byteLength(body)));
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.status(200).send(body);
  }
}
