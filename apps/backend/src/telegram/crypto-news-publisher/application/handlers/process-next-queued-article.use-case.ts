import { Injectable, Logger } from '@nestjs/common';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { PublisherThrottleStateRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-throttle-state.repository';
import { ThrottleSchedulerService } from 'telegram/crypto-news-publisher/application/services/throttle-scheduler.service';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { TelegramPublisherPort } from 'telegram/shared';
import { CryptoNewsLlmAdapter } from 'telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter';
import {
  loadCryptoNewsPublisherConfig,
  type CryptoNewsPublisherConfig,
} from 'telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config';

/**
 * Orchestrator use case: drain one PENDING entry from the publisher
 * queue end-to-end.
 *
 * Order of operations (mirrors plan §T5 of
 * `.omo/plans/crypto-news-publisher.md`):
 *
 *   1. Daily-cap check — if 36+ already published in the current UTC
 *      window, return without touching anything.
 *   2. Throttle check — the random-delay window is honoured; if the
 *      cron ticked too soon after the previous publish, return.
 *   3. Queue dequeue — oldest PENDING entry. If none, return.
 *   4. LLM refinement — call the crypto-news adapter to rewrite the
 *      text. The adapter is the only place that touches the local
 *      image file (reads + base64-encodes for the LLM).
 *   5. Publish — try `sendPhoto` first (entry has a local image);
 *      fall back to `sendMessage` when the entry has no image.
 *   6. On success: mark the entry PUBLISHED, persist the new
 *      `lastPublishAt` so the next tick honours the random delay.
 *   7. On failure: increment attempts (re-queue) up to
 *      `publishing.llmMaxAttempts`; past that, mark FAILED.
 *
 * The use case is fail-safe: every step is wrapped so a thrown error
 * does not crash the cron tick — the error is logged and the entry's
 * state is updated accordingly. The cron scheduler treats this
 * method as a "best-effort, single entry per tick" boundary.
 */
@Injectable()
export class ProcessNextQueuedArticleUseCase {
  private readonly logger = new Logger(ProcessNextQueuedArticleUseCase.name);
  private readonly config: CryptoNewsPublisherConfig;

  public constructor(
    private readonly queueRepo: PublisherQueueRepository,
    private readonly throttleScheduler: ThrottleSchedulerService,
    private readonly llmAdapter: CryptoNewsLlmAdapter,
    private readonly publisher: TelegramPublisherPort,
    private readonly throttleStateRepo: PublisherThrottleStateRepository,
  ) {
    this.config = loadCryptoNewsPublisherConfig();
  }

  /**
   * Drain one entry. Always returns `void` — the only observable
   * effects are (a) the entry's persisted state, (b) the throttle
   * state's `lastPublishAt`, and (c) a Telegram message.
   */
  public async execute(): Promise<void> {
    if (!(await this.canPublishToday())) {
      this.logger.log('daily cap reached — skipping tick');
      return;
    }
    const now = new Date();
    const decision = await this.throttleScheduler.shouldPublish(now);
    if (!decision.canPublish) {
      this.logger.log(
        `throttle active — next publish in ${decision.nextDelayMs}ms`,
      );
      return;
    }
    const entry = await this.queueRepo.findNextPending();
    if (entry === null) {
      this.logger.log('no pending entries — skipping tick');
      return;
    }

    try {
      const refinedText = await this.llmAdapter.generateForEntry(entry);
      const result = await this.dispatchToTelegram(entry, refinedText);
      if (!result.ok || result.messageId === null) {
        throw new Error(result.error ?? 'telegram publish returned no id');
      }
      await this.queueRepo.markPublished(entry.id, String(result.messageId));
      await this.throttleScheduler.setLastPublishAt(now);
      this.logger.log(
        `published queue entry ${entry.id} as telegram message ${result.messageId}`,
      );
    } catch (err) {
      await this.handlePublishFailure(entry, err);
    }
  }

  /**
   * Pick `sendPhoto` (with the local image) when the entry has an
   * `imagePath`; fall back to `sendMessage` otherwise. The adapter
   * itself decides what to do with the `chatId` argument — the
   * crypto-news adapter ignores it and uses the configured channel.
   */
  private async dispatchToTelegram(
    entry: PublisherQueueEntry,
    refinedText: string,
  ) {
    if (entry.imagePath) {
      return this.publisher.sendPhoto(
        this.config.targetChannel,
        refinedText,
        entry.imagePath,
      );
    }
    return this.publisher.sendMessage(this.config.targetChannel, refinedText);
  }

  /**
   * Translate a publish failure into the correct queue state
   * transition. Retry budget is `publishing.llmMaxAttempts` from
   * config. Past the cap, the entry is marked FAILED (terminal).
   */
  private async handlePublishFailure(
    entry: PublisherQueueEntry,
    err: unknown,
  ): Promise<void> {
    const reason = err instanceof Error ? err.message : 'unknown error';
    this.logger.error(
      `failed to publish queue entry ${entry.id}: ${reason}`,
      err instanceof Error ? err.stack : undefined,
    );
    if (entry.attempts + 1 < this.config.publishing.llmMaxAttempts) {
      try {
        await this.queueRepo.incrementAttempts(entry.id);
        this.logger.log(
          `incremented attempts for queue entry ${entry.id} ` +
            `(attempts=${entry.attempts + 1}/` +
            `${this.config.publishing.llmMaxAttempts})`,
        );
      } catch (incErr) {
        this.logger.error(
          `failed to increment attempts for ${entry.id}: ` +
            `${(incErr as Error).message}`,
        );
      }
      return;
    }
    try {
      await this.queueRepo.markFailed(entry.id, reason);
      this.logger.log(
        `queue entry ${entry.id} marked FAILED after ` +
          `${entry.attempts + 1} attempts: ${reason}`,
      );
    } catch (failErr) {
      this.logger.error(
        `failed to mark entry ${entry.id} as FAILED: ` +
          `${(failErr as Error).message}`,
      );
    }
  }

  /**
   * Daily cap: at most `publishing.dailyCap` PUBLISHED rows in the
   * current UTC window (resets at `dailyResetUtcHour`).
   */
  private async canPublishToday(): Promise<boolean> {
    const published = await this.queueRepo.countPublishedToday(
      this.config.publishing.dailyResetUtcHour,
    );
    return published < this.config.publishing.dailyCap;
  }
}
