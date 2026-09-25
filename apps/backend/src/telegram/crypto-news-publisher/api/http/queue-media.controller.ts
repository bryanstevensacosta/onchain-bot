import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import type { Request, Response } from 'express';
import type { AppConfig } from 'shared/common/config/app.config';
import { resolveIngestionServiceUrl } from 'shared/common/config/app.config';
import {
  detectMediaMimeType,
  serveMediaFile,
} from 'shared/common/http/media-serving';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

/**
 * REST API for serving media attached to crypto-news publisher queue entries.
 *
 * Endpoints (all under `/crypto-news-publisher/queue`):
 *  - GET /:id/media  Serve the downloaded image attached to a queue entry
 */
@ApiTags('crypto-news-publisher')
@Controller(['crypto-news-publisher/queue', 'feed-publisher/queue'])
export class QueueMediaController {
  private readonly logger = new Logger(QueueMediaController.name);
  private readonly ingestionBaseUrl: string;

  public constructor(
    private readonly queueRepo: PublisherQueueRepository,
    config: ConfigService,
  ) {
    const appCfg = config.get<AppConfig>('app');
    this.ingestionBaseUrl =
      appCfg?.ingestion?.serviceUrl ?? resolveIngestionServiceUrl();
  }

  @Get(':id/media')
  @ApiOperation({ summary: 'Serve the image attached to a queue entry' })
  @ApiParam({ name: 'id', description: 'Queue entry id (uuid)' })
  @ApiQuery({
    name: 'index',
    required: false,
    description: 'Image index within imagePaths',
  })
  @ApiResponse({ status: 200, description: 'Image bytes' })
  @ApiResponse({
    status: 404,
    description: 'Unknown entry id or missing media',
  })
  public async getQueueMedia(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
    @Query('index') index?: string,
  ): Promise<void> {
    const entry = await this.queueRepo.findByIdForDisplay(id);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    // Determine which image path to serve
    let imagePath: string | null;
    if (index !== undefined && index !== '') {
      const idx = parseInt(index, 10);
      imagePath = Number.isFinite(idx) ? (entry.imagePaths[idx] ?? null) : null;
    } else {
      imagePath = entry.imagePath;
    }

    if (!imagePath) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    // Check if this is a URL (from ingestion-telegram) or a local file path
    const isUrl =
      imagePath.startsWith('http://') || imagePath.startsWith('https://');

    if (isUrl) {
      // Proxy to ingestion-telegram
      try {
        const response = await fetch(imagePath);

        if (!response.ok) {
          res
            .status(response.status)
            .json({ error: 'Media not found on ingestion-telegram' });
          return;
        }

        const contentType =
          response.headers.get('content-type') || 'application/octet-stream';
        const buffer = Buffer.from(await response.arrayBuffer());

        serveMediaFile(res, req, buffer, contentType, 'public, max-age=86400');
      } catch (err) {
        this.logger.error(
          `Failed to proxy media from ingestion-telegram: ${err}`,
        );
        res
          .status(502)
          .json({ error: 'Failed to fetch media from ingestion-telegram' });
      }
    } else {
      // Legacy: serve from local disk
      let fileBuffer: Buffer;
      try {
        fileBuffer = await fs.promises.readFile(imagePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          // File not found locally, try fallback proxy to ingestion-telegram
          this.logger.debug(
            `File not found locally: ${imagePath}, trying ingestion-telegram proxy`,
          );

          try {
            const ingestionUrl = this.convertLocalPathToIngestionUrl(imagePath);
            const response = await fetch(ingestionUrl);

            if (!response.ok) {
              res.status(404).json({
                error: 'Media file missing on disk and ingestion-telegram',
              });
              return;
            }

            const contentType =
              response.headers.get('content-type') ||
              'application/octet-stream';
            const buffer = Buffer.from(await response.arrayBuffer());

            serveMediaFile(
              res,
              req,
              buffer,
              contentType,
              'public, max-age=86400',
            );
            return;
          } catch (proxyErr) {
            this.logger.error(
              `Failed to proxy from ingestion-telegram: ${proxyErr}`,
            );
            res.status(404).json({ error: 'Media file missing on disk' });
            return;
          }
        }
        throw err;
      }

      const mimeType = detectMediaMimeType(imagePath, null, fileBuffer);

      serveMediaFile(res, req, fileBuffer, mimeType, 'public, max-age=86400');
    }
  }

  /**
   * Convert a local file path to an ingestion-telegram URL.
   *
   * Example:
   *   uploads/crypto-news/media/-1004466661332/200_0.jpg
   *   → http://localhost:3031/api/media/-1004466661332/200/0
   */
  private convertLocalPathToIngestionUrl(localPath: string): string {
    const match = localPath.match(
      /crypto-news\/media\/([^/]+)\/(\d+)_(\d+)\.\w+$/,
    );

    if (!match) {
      throw new Error(`Cannot parse local path: ${localPath}`);
    }

    const channelId = match[1];
    const messageId = match[2];
    const index = match[3];

    return `${this.ingestionBaseUrl}/api/media/${channelId}/${messageId}/${index}`;
  }
}
