import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Response } from 'express';
import type { AppConfig } from 'shared/common/config/app.config';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { CryptoNewsSourceRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-source.repository';
import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';

export interface QueueEntryView {
  readonly id: string;
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
@Controller('crypto-news-publisher/queue')
export class QueueController {
  /** UTC reset hour for the 24h window (4am UTC). */
  private static readonly RESET_HOUR_UTC = 4;

  private readonly outputChannel: string;

  public constructor(
    private readonly queueRepo: PublisherQueueRepository,
    private readonly llmConfigRepo: LlmConfigRepository,
    private readonly sourceRepo: CryptoNewsSourceRepository,
    config: ConfigService,
  ) {
    const appCfg = config.get<AppConfig>('app');
    this.outputChannel = appCfg?.publishing?.cryptoNews?.outputChannel ?? '';
  }

  @Get()
  public async list(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ): Promise<ReadonlyArray<QueueEntryView>> {
    const parsed = parseInt(limit ?? '', 10);
    const n = Math.max(1, Math.min(500, Number.isFinite(parsed) ? parsed : 50));
    const entries = await this.queueRepo.findAllForDisplay(n);
    const allSources = await this.sourceRepo.findAll();
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

  private static readonly MEDIA_MIME_BY_EXT: Readonly<Record<string, string>> =
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@Param('id') id: string): Promise<void> {
    const entry = await this.queueRepo.findByIdForDisplay(id);
    if (!entry) {
      throw new NotFoundException(`Queue entry ${id} not found`);
    }
    await this.queueRepo.delete(id);
  }

  @Get(':id/media')
  public async getQueueMedia(
    @Param('id') id: string,
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

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.promises.readFile(imagePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({ error: 'Media file missing on disk' });
        return;
      }
      throw err;
    }

    const ext = path.extname(imagePath).slice(1).toLowerCase();
    const mimeType =
      QueueController.MEDIA_MIME_BY_EXT[ext] ?? 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileBuffer.length.toString());
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(fileBuffer);
  }

  private async countPending(): Promise<number> {
    const entries = await this.queueRepo.findAllForDisplay(500);
    return entries.filter((e) => e.status === 'PENDING').length;
  }

  private async toView(
    entry: PublisherQueueEntry,
    sourceByChannelId: Map<string, CryptoNewsSource>,
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
    const publishedTelegramUrl =
      entry.telegramMessageId && outputChannelForLink
        ? `https://t.me/c/${outputChannelForLink}/${entry.telegramMessageId}`
        : null;

    // Queue list always shows source link; DetailsModal shows published link
    const telegramUrl = sourceTelegramUrl;

    return {
      id: entry.id,
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
    };
  }
}
