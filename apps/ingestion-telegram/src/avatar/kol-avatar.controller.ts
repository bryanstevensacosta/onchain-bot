import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createReadStream, statSync } from 'fs';
import type { Response } from 'express';
import { KolAvatarService } from './kol-avatar.service';
import {
  KOL_AVATAR_CONTENT_TYPE,
  KOL_AVATAR_PLACEHOLDER_CONTENT_TYPE,
  KOL_AVATAR_PLACEHOLDER_SVG,
  sanitizeAvatarChannelId,
} from './avatar.constants';

/**
 * KOL avatar HTTP API (Tramo 1, todo 13, P19).
 *
 * - `GET /api/kol-avatar/:channelId` — stored photo (200, 1y cache) or the
 *   inline placeholder SVG (200) when no photo was ever fetched / the
 *   MTProto fetch failed. Public (keyless GET, like `/api/media/*`).
 * - `POST /api/kol-avatar/:channelId/refresh` — explicit manual refresh
 *   through the guarded fetch path (P19: the ONLY re-fetch; P29: same
 *   serialized guard). Protected (POST → API key when set).
 */
@ApiTags('kol-avatar')
@Controller('api/kol-avatar')
export class KolAvatarController {
  public constructor(private readonly avatars: KolAvatarService) {}

  @Get(':channelId')
  @ApiOperation({ summary: 'Serve a KOL channel avatar (or placeholder)' })
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
    if (this.avatars.hasAvatar(channelId)) {
      const filePath = this.avatars.avatarFilePath(channelId);
      let size = 0;
      try {
        size = statSync(filePath).size;
      } catch {
        this.sendPlaceholder(response);
        return;
      }
      response.setHeader('Content-Type', KOL_AVATAR_CONTENT_TYPE);
      response.setHeader('Content-Length', String(size));
      response.setHeader('Cache-Control', 'public, max-age=31536000');
      createReadStream(filePath).pipe(response);
      return;
    }
    this.sendPlaceholder(response);
  }

  @Post(':channelId/refresh')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Explicit manual avatar refresh (guarded fetch)' })
  @ApiParam({ name: 'channelId', description: 'Telegram channel id' })
  @ApiResponse({ status: 201, description: 'Refresh outcome' })
  @ApiResponse({ status: 400, description: 'Invalid channelId' })
  public async refreshAvatar(@Param('channelId') channelId: string): Promise<{
    channelId: string;
    avatar: string;
    avatarUrl: string;
  }> {
    const clean = sanitizeAvatarChannelId(channelId);
    if (clean.length === 0) {
      throw new BadRequestException(
        `Invalid channelId: ${channelId}. Must contain alphanumeric characters`,
      );
    }
    const avatar = await this.avatars.refresh(channelId);
    return {
      channelId,
      avatar,
      avatarUrl: this.avatars.avatarUrlFor(channelId),
    };
  }

  private sendPlaceholder(response: Response): void {
    const body = KOL_AVATAR_PLACEHOLDER_SVG;
    response.setHeader('Content-Type', KOL_AVATAR_PLACEHOLDER_CONTENT_TYPE);
    response.setHeader('Content-Length', String(Buffer.byteLength(body)));
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.status(200).send(body);
  }
}
