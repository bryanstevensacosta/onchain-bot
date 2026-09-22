import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
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
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import type { CryptoNewsSourceDto } from 'telegram/crypto-news-integration/infrastructure/http/crypto-news-ingestion-client.service';

/**
 * Minimal source view needed to render queue entries.
 *
 * Satisfied by `CryptoNewsSourceDto` (HTTP, ingestion-telegram owner) — the
 * deprecated `CryptoNewsSourceRepository` in-memory shim returned an empty
 * store, so this controller now fetches sources live via
 * GET `{ingestionBaseUrl}/api/feed/sources` (Opción A, T7).
 */
interface QueueSourceView {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
}

export interface QueueEntryView {
  readonly id: string;
  readonly traceId: string;
  readonly channelId: string;
  readonly sourceHandle: string | null;
  readonly sourceTitle: string | null;
  readonly messageId: number;
  readonly rawTitle: string | null;
  readonly rawContent: string | null;
  readonly imagePath: string | null;
  readonly imagePaths: string[];
  readonly groupedId: string | null;
  readonly matchedKeywordIds: string[];
  readonly status: string;
  readonly messageReceivedAt: string;
  readonly publishedAt: string | null;
  readonly telegramMessageId: string | null;
  readonly telegramUrl: string | null;
  readonly lastError: string | null;
  readonly attempts: number;
  readonly generatedContent: string | null;
  readonly generatedSystemPrompt: string | null;
  readonly generatedUserPrompt: string | null;
  readonly generatedTemperature: number | null;
  readonly generatedReasoningEffort: string | null;
  readonly generatedModel: string | null;
  readonly blockedReason: string | null;
  readonly duplicateOfChannelId: string | null;
  readonly duplicateOfMessageId: number | null;
  readonly duplicateOfEntryId: string | null;
  readonly duplicateOfSourceHandle: string | null;
  readonly duplicateOfTelegramUrl: string | null;
  readonly displayName: string;
}

export interface QueueCountsView {
  readonly pending: number;
  readonly publishedToday: number;
  readonly dailyCap: number;
  readonly remaining: number;
}

/**
 * REST API for the crypto-news publisher queue.
 *
 * Endpoints (all under `/crypto-news-publisher/queue`):
 *  - GET /           List the most-recent queue entries (default 50, max 500)
 *  - GET /counts     Return pending count + today's publish count + remaining cap
 *  - GET /:id/media  Serve the downloaded image attached to a queue entry
 */
@ApiTags('crypto-news-publisher')
@Controller('crypto-news-publisher/queue')
export class QueueController {
  /** UTC reset hour for the 24h window (4am UTC). */
  private static readonly RESET_HOUR_UTC = 4;

  private readonly logger = new Logger(QueueController.name);
  private readonly outputChannel: string;
  private readonly ingestionBaseUrl: string;

  public constructor(
    private readonly queueRepo: PublisherQueueRepository,
    private readonly llmConfigRepo: LlmConfigRepository,
    config: ConfigService,
  ) {
    const appCfg = config.get<AppConfig>('app');
    this.outputChannel = appCfg?.publishing?.cryptoNews?.outputChannel ?? '';
    this.ingestionBaseUrl =
      appCfg?.ingestion?.serviceUrl ?? resolveIngestionServiceUrl();
  }

  @Get()
  @ApiOperation({ summary: 'List the most-recent publisher queue entries' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max entries (1-500, default 50)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by entry status' })
  @ApiResponse({ status: 200, description: 'Queue entries (newest first)' })
  public async list(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ): Promise<ReadonlyArray<QueueEntryView>> {
    const parsed = parseInt(limit ?? '', 10);
    const n = Math.max(1, Math.min(500, Number.isFinite(parsed) ? parsed : 50));
    const entries = await this.queueRepo.findAllForDisplay(n);
    const allSources = await this.fetchSourcesFromIngestion();
    const sourceByChannelId = new Map(allSources.map((s) => [s.channelId, s]));
    const views = await Promise.all(
      entries.map((e) => this.toView(e, sourceByChannelId)),
    );
    if (status) {
      return views.filter((v) => v.status === status);
    }
    return views;
  }

  @Get('counts')
  @ApiOperation({ summary: 'Pending count plus daily publish cap usage' })
  @ApiResponse({ status: 200, description: 'Queue counters' })
  public async counts(): Promise<QueueCountsView> {
    const [pending, publishedToday, cfg] = await Promise.all([
      this.countPending(),
      this.queueRepo.countPublishedToday(QueueController.RESET_HOUR_UTC),
      this.llmConfigRepo.load(),
    ]);

    const dailyCap = cfg.dailyCap;
    const remaining = Math.max(0, dailyCap - publishedToday);

    return {
      pending,
      publishedToday,
      dailyCap,
      remaining,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a publisher queue entry' })
  @ApiParam({ name: 'id', description: 'Queue entry id (uuid)' })
  @ApiResponse({ status: 204, description: 'Queue entry deleted' })
  @ApiResponse({ status: 404, description: 'Unknown queue entry id' })
  public async remove(@Param('id') id: string): Promise<void> {
    const entry = await this.queueRepo.findByIdForDisplay(id);
    if (!entry) {
      throw new NotFoundException(`Queue entry ${id} not found`);
    }
    await this.queueRepo.delete(id);
  }

  @Get(':id/media')
  @ApiOperation({ summary: 'Serve the image attached to a queue entry' })
  @ApiParam({ name: 'id', description: 'Queue entry id (uuid)' })
  @ApiQuery({ name: 'index', required: false, description: 'Image index within imagePaths' })
  @ApiResponse({ status: 200, description: 'Image bytes' })
  @ApiResponse({ status: 404, description: 'Unknown entry id or missing media' })
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

  private async countPending(): Promise<number> {
    const entries = await this.queueRepo.findAllForDisplay(500);
    return entries.filter((e) => e.status === 'PENDING').length;
  }

  private async fetchSourcesFromIngestion(): Promise<
    ReadonlyArray<QueueSourceView>
  > {
    try {
      const response = await fetch(
        `${this.ingestionBaseUrl}/api/feed/sources`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      );
      if (!response.ok) {
        this.logger.warn(
          `Ingestion-telegram returned ${response.status} for /api/feed/sources`,
        );
        return [];
      }
      const body: unknown = await response.json();
      const sources = Array.isArray(body)
        ? (body as ReadonlyArray<CryptoNewsSourceDto>)
        : body !== null &&
            typeof body === 'object' &&
            'data' in body &&
            Array.isArray(body.data)
          ? (body as { data: ReadonlyArray<CryptoNewsSourceDto> }).data
          : [];
      return sources.map((s) => ({
        channelId: s.channelId,
        handle: s.handle,
        title: s.title,
      }));
    } catch (err) {
      this.logger.warn(
        `Failed to fetch sources from ingestion-telegram: ${(err as Error).message}`,
      );
      return [];
    }
  }

  private async toView(
    entry: PublisherQueueEntry,
    sourceByChannelId: Map<string, QueueSourceView>,
  ): Promise<QueueEntryView> {
    const source = sourceByChannelId.get(entry.channelId) ?? null;
    const sourceHandle = source?.handle ?? null;
    const sourceTitle = source?.title ?? null;

    // Telegram link to the ORIGINAL post in the source channel
    const sourceChannelForLink = entry.channelId.replace(/^-100/, '');
    const sourceTelegramUrl =
      entry.messageId && sourceHandle
        ? `https://t.me/${sourceHandle}/${entry.messageId}`
        : entry.messageId && sourceChannelForLink
          ? `https://t.me/c/${sourceChannelForLink}/${entry.messageId}`
          : null;

    // Telegram link to the PUBLISHED post (output channel)
    const outputChannelForLink = this.outputChannel.replace(/^-100/, '');
    const _publishedTelegramUrl =
      entry.telegramMessageId && outputChannelForLink
        ? `https://t.me/c/${outputChannelForLink}/${entry.telegramMessageId}`
        : null;

    // Telegram link to the DUPLICATE-OF source (used by Blocked Post Details modal)
    const duplicateOfSource = entry.duplicateOfChannelId
      ? (sourceByChannelId.get(entry.duplicateOfChannelId) ?? null)
      : null;
    const duplicateOfSourceHandle = duplicateOfSource?.handle ?? null;
    const duplicateOfChannelForLink =
      entry.duplicateOfChannelId?.replace(/^-100/, '') ?? null;
    const duplicateOfTelegramUrl =
      entry.duplicateOfMessageId && duplicateOfSourceHandle
        ? `https://t.me/${duplicateOfSourceHandle}/${entry.duplicateOfMessageId}`
        : entry.duplicateOfMessageId && duplicateOfChannelForLink
          ? `https://t.me/c/${duplicateOfChannelForLink}/${entry.duplicateOfMessageId}`
          : null;

    // Queue list always shows source link; DetailsModal shows published link
    const telegramUrl = sourceTelegramUrl;

    return {
      id: entry.id,
      traceId: entry.traceId,
      channelId: entry.channelId,
      sourceHandle,
      sourceTitle,
      messageId: entry.messageId,
      rawTitle: entry.rawTitle,
      rawContent: entry.rawContent,
      imagePath: entry.imagePath,
      imagePaths: entry.imagePaths,
      groupedId: entry.groupedId,
      matchedKeywordIds: entry.matchedKeywordIds,
      status: entry.status,
      messageReceivedAt: entry.messageReceivedAt.toISOString(),
      publishedAt: entry.publishedAt?.toISOString() ?? null,
      telegramMessageId: entry.telegramMessageId,
      telegramUrl,
      lastError: entry.lastError,
      attempts: entry.attempts,
      generatedContent: entry.generatedContent,
      generatedSystemPrompt: entry.generatedSystemPrompt,
      generatedUserPrompt: entry.generatedUserPrompt,
      generatedTemperature: entry.generatedTemperature,
      generatedReasoningEffort: entry.generatedReasoningEffort,
      generatedModel: entry.generatedModel,
      blockedReason: entry.blockedReason,
      duplicateOfChannelId: entry.duplicateOfChannelId,
      duplicateOfMessageId: entry.duplicateOfMessageId,
      duplicateOfEntryId: entry.duplicateOfEntryId,
      duplicateOfSourceHandle,
      duplicateOfTelegramUrl,
      displayName:
        sourceHandle?.replace(/^@/, '') ?? sourceTitle ?? entry.channelId,
    };
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
