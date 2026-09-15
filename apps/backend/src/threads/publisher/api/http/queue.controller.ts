import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ThreadsLlmConfigRepository } from 'threads/publisher/application/ports/threads-llm-config.repository';
import { ThreadsQueueRepository } from 'threads/publisher/application/ports/threads-queue.repository';
import { ThreadsQueueEntry } from 'threads/publisher/domain/entities/threads-queue-entry.entity';

export interface ThreadsQueueEntryView {
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

export interface ThreadsQueueCountsView {
  readonly pending: number;
  readonly publishedToday: number;
  readonly dailyCap: number;
  readonly remaining: number;
}

/**
 * REST API for the threads publisher queue.
 *
 * Threads-typed mirror of the crypto-news `QueueController`
 * (`telegram/crypto-news-publisher/api/http/queue.controller.ts`),
 * reduced to the T4 surface: list + counts + cancel.
 *
 * Endpoints (all under `/threads-publisher/queue`):
 *  - GET /           List the most-recent queue entries (default 50, max 500)
 *  - GET /counts     Return pending count + today's publish count + remaining cap
 *  - DELETE /:id     Cancel (hard-delete) a queue entry
 *
 * Differences from the crypto-news mirror (deliberate):
 *  - No `GET /:id/media`: threads is TEXT-only MVP (media is
 *    stripped pre-publish with a `media_skipped` log, never stored
 *    for serving).
 *  - No source lookup: threads has no sources table (ingestion owns
 *    crypto-news sources; threads matches against channel ids
 *    directly), so `sourceHandle`/`sourceTitle` are always null and
 *    `displayName` falls back to the raw `channelId`.
 *  - No `threads_oauth_tokens.access_token` is ever exposed here
 *    (the queue entry carries no token field at all).
 */
@Controller('threads-publisher/queue')
export class ThreadsQueueController {
  /** UTC reset hour for the 24h window (4am UTC). */
  private static readonly RESET_HOUR_UTC = 4;

  public constructor(
    private readonly queueRepo: ThreadsQueueRepository,
    private readonly llmConfigRepo: ThreadsLlmConfigRepository,
  ) {}

  @Get()
  public async list(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ): Promise<ReadonlyArray<ThreadsQueueEntryView>> {
    const parsed = parseInt(limit ?? '', 10);
    const n = Math.max(1, Math.min(500, Number.isFinite(parsed) ? parsed : 50));
    const entries = await this.queueRepo.findAllForDisplay(n);
    const views = entries.map((e) => this.toView(e));
    if (status) {
      return views.filter((v) => v.status === status);
    }
    return views;
  }

  @Get('counts')
  public async counts(): Promise<ThreadsQueueCountsView> {
    const [pending, publishedToday, cfg] = await Promise.all([
      this.queueRepo.countPending(),
      this.queueRepo.countPublishedToday(ThreadsQueueController.RESET_HOUR_UTC),
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
  public async remove(@Param('id') id: string): Promise<void> {
    const entry = await this.queueRepo.findByIdForDisplay(id);
    if (!entry) {
      throw new NotFoundException(`Queue entry ${id} not found`);
    }
    await this.queueRepo.delete(id);
  }

  private toView(entry: ThreadsQueueEntry): ThreadsQueueEntryView {
    return {
      id: entry.id,
      traceId: entry.traceId,
      channelId: entry.channelId,
      sourceHandle: null,
      sourceTitle: null,
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
      telegramUrl: null,
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
      duplicateOfSourceHandle: null,
      duplicateOfTelegramUrl: null,
      displayName: entry.channelId,
    };
  }
}
