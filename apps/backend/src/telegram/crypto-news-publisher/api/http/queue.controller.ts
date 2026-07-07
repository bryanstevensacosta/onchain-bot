import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Response } from 'express';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';

export interface QueueEntryView {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly rawTitle: string | null;
  readonly rawContent: string | null;
  readonly imagePath: string | null;
  readonly groupedId: string | null;
  readonly status: string;
  readonly messageReceivedAt: string;
  readonly publishedAt: string | null;
  readonly telegramMessageId: string | null;
  readonly lastError: string | null;
  readonly attempts: number;
}

export interface QueueCountsView {
  readonly pending: number;
  readonly publishedToday: number;
  readonly dailyCap: number;
  readonly remainingToday: number;
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
  /** Hard cap of publishes per 24h window (matches `MAX_QUEUE_DEPTH` for now). */
  private static readonly DAILY_PUBLISH_CAP = 36;

  /** UTC reset hour for the 24h window (4am UTC). */
  private static readonly RESET_HOUR_UTC = 4;

  public constructor(private readonly queueRepo: PublisherQueueRepository) {}

  @Get()
  public async list(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<QueueEntryView>> {
    const parsed = parseInt(limit ?? '', 10);
    const n = Math.max(1, Math.min(500, Number.isFinite(parsed) ? parsed : 50));
    const entries = await this.queueRepo.findAllForDisplay(n);
    return entries.map(QueueController.toView);
  }

  @Get('counts')
  public async counts(): Promise<QueueCountsView> {
    const [pending, publishedToday] = await Promise.all([
      this.countPending(),
      this.queueRepo.countPublishedToday(QueueController.RESET_HOUR_UTC),
    ]);

    const remainingToday = Math.max(
      0,
      QueueController.DAILY_PUBLISH_CAP - publishedToday,
    );

    return {
      pending,
      publishedToday,
      dailyCap: QueueController.DAILY_PUBLISH_CAP,
      remainingToday,
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

  @Get(':id/media')
  public async getQueueMedia(
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const entry = await this.queueRepo.findByIdForDisplay(id);
    if (!entry || !entry.imagePath) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.promises.readFile(entry.imagePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).json({ error: 'Media file missing on disk' });
        return;
      }
      throw err;
    }

    const ext = path.extname(entry.imagePath).slice(1).toLowerCase();
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

  private static readonly toView = (
    entry: PublisherQueueEntry,
  ): QueueEntryView => ({
    id: entry.id,
    channelId: entry.channelId,
    messageId: entry.messageId,
    rawTitle: entry.rawTitle,
    rawContent: entry.rawContent,
    imagePath: entry.imagePath,
    groupedId: entry.groupedId,
    status: entry.status,
    messageReceivedAt: entry.messageReceivedAt.toISOString(),
    publishedAt: entry.publishedAt?.toISOString() ?? null,
    telegramMessageId: entry.telegramMessageId,
    lastError: entry.lastError,
    attempts: entry.attempts,
  });
}
