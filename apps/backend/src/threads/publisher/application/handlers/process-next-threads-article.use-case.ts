import { Injectable, Logger } from '@nestjs/common';
import { LlmPort } from 'shared/llm';
import { isBlockingFailureReason } from 'shared/deduplication/domain/constants/blocking-failure-reasons';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { findNonLatinCharacter } from 'telegram/crypto-news-publisher/application/services/latin-script-validator';
import { ThreadsQueueEntry } from 'threads/publisher/domain/entities/threads-queue-entry.entity';
import { ThreadsQueueRepository } from 'threads/publisher/application/ports/threads-queue.repository';
import { ThreadsLlmConfigRepository } from 'threads/publisher/application/ports/threads-llm-config.repository';
import { ThreadsApiPublisherPort } from 'threads/publisher/application/ports/threads-api-publisher.port';

/**
 * Use case: drain ONE pending Threads queue entry per tick.
 *
 * Clone of `ProcessNextQueuedArticleUseCase` (crypto-news),
 * Threads-typed and trimmed to the T2 scope (no slot arbitrator, no
 * ads rotation, no media cleanup — those arrive with T4/T5 if needed):
 *  1. Daily cap (`dailyCap`, default 60): skip when
 *     `countPublishedToday(resetHourUtc)` is at capacity.
 *  2. Throttle: `SharedThrottleSchedulerService` with 60s–300s bounds
 *     (injected via `SHARED_THROTTLE_BOUNDS`, same service class the
 *     crypto-news publisher uses).
 *  3. Pick the oldest PENDING entry.
 *  4. LLM-or-raw branch on flags: LLM generation ONLY when BOTH
 *     `llmEnabled` AND `publishingEnabled` are true (mirrors the
 *     crypto-news critical dependency); otherwise publish raw.
 *  5. Publish via `ThreadsApiPublisherPort` (T3 owns the real
 *     adapter; specs use a fake of this port).
 *  6. State transitions mirror `VALID_PUBLISH_TRANSITIONS`
 *     (PENDING/SCHEDULED → PUBLISHED | FAILED): blocking failures
 *     (shared `isBlockingFailureReason()` or `reintentable=false`)
 *     go terminal immediately; transient failures consume the
 *     `llmMaxAttempts` retry budget first.
 */
@Injectable()
export class ProcessNextThreadsArticleUseCase {
  private readonly logger = new Logger(ProcessNextThreadsArticleUseCase.name);

  public constructor(
    private readonly queueRepo: ThreadsQueueRepository,
    private readonly throttleScheduler: SharedThrottleSchedulerService,
    private readonly llmPort: LlmPort,
    private readonly publisher: ThreadsApiPublisherPort,
    private readonly llmConfigRepo: ThreadsLlmConfigRepository,
  ) {}

  /**
   * Drain one entry. Always returns `void` — the only observable
   * effects are (a) the entry's persisted state and (b) the throttle
   * state's `lastPublishAt`.
   */
  public async execute(): Promise<void> {
    const cfg = await this.llmConfigRepo.load();

    if (!(await this.canPublishToday(cfg.dailyCap, cfg.dailyResetUtcHour))) {
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
      // LLM refinement ONLY when both flags are on (publishingEnabled
      // is already gated by the cron scheduler; double-checked here so
      // direct invocations can't burn LLM budget while paused).
      let contentToPublish: string;
      let generated:
        | {
            content: string;
            systemPrompt: string | null;
            userPrompt: string | null;
            temperature: number | null;
            reasoningEffort: string | null;
            model: string | null;
          }
        | undefined;

      if (cfg.llmEnabled && cfg.publishingEnabled) {
        const prompt =
          `Rewrite the following crypto update as a single Threads post. ` +
          `Keep the facts, drop promo fluff:\n\n${entry.rawContent}`;
        const content = await this.llmPort.generateText({ prompt });
        generated = {
          content,
          systemPrompt: null,
          userPrompt: prompt,
          temperature: null,
          reasoningEffort: null,
          model: null,
        };
        contentToPublish = content;

        if (cfg.rejectNonLatin) {
          const bad = findNonLatinCharacter(contentToPublish);
          if (bad) {
            const reason =
              `LLM output rejected: non-Latin character '${bad.char}' ` +
              `(U+${bad.codePoint.toString(16).toUpperCase().padStart(4, '0')}) detected`;
            this.logger.warn(`queue entry ${entry.id} rejected: ${reason}`);
            await this.queueRepo.markFailed(entry.id, reason);
            return;
          }
        }
      } else {
        this.logger.log(
          `publishing raw content for entry ${entry.id} ` +
            `(llmEnabled=${cfg.llmEnabled}, publishingEnabled=${cfg.publishingEnabled})`,
        );
        contentToPublish = entry.rawContent;
      }

      const result = await this.publisher.publish({ text: contentToPublish });
      if (!result.ok) {
        await this.handlePublishFailure(entry, result.reason, {
          reintentable: result.reintentable,
          llmMaxAttempts: cfg.llmMaxAttempts,
        });
        return;
      }

      await this.queueRepo.markPublished(entry.id, result.remoteId, generated);
      await this.throttleScheduler.setLastPublishAt(now);

      this.logger.log(
        `published queue entry ${entry.id} as threads post ${result.remoteId}` +
          (generated ? ' (LLM)' : ' (raw)'),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      await this.handlePublishFailure(entry, reason, {
        reintentable: true,
        llmMaxAttempts: cfg.llmMaxAttempts,
      });
    }
  }

  /**
   * Daily cap: at most `dailyCap` PUBLISHED rows in the current UTC
   * window (resets at `dailyResetUtcHour`). Default 60 comes from the
   * config seed; the parameter is read from `ThreadsLlmConfig` here.
   */
  private async canPublishToday(
    dailyCap: number,
    resetHourUtc: number,
  ): Promise<boolean> {
    const published = await this.queueRepo.countPublishedToday(resetHourUtc);
    return published < dailyCap;
  }

  /**
   * Translate a publish failure into the correct queue state
   * transition. Content-blocking failures (shared
   * `isBlockingFailureReason()`) and non-reintentable adapter
   * failures go terminal immediately (no point retrying content the
   * platform will never accept). Transient failures consume the
   * `llmMaxAttempts` retry budget first; past the cap the entry is
   * marked FAILED (terminal).
   */
  private async handlePublishFailure(
    entry: ThreadsQueueEntry,
    reason: string,
    opts: { reintentable: boolean; llmMaxAttempts: number },
  ): Promise<void> {
    this.logger.error(`failed to publish queue entry ${entry.id}: ${reason}`);
    if (!opts.reintentable || isBlockingFailureReason(reason)) {
      await this.queueRepo.markFailed(entry.id, reason);
      this.logger.log(
        `queue entry ${entry.id} marked FAILED (non-retryable): ${reason}`,
      );
      return;
    }
    if (entry.attempts + 1 < opts.llmMaxAttempts) {
      await this.queueRepo.incrementAttempts(entry.id);
      this.logger.log(
        `incremented attempts for queue entry ${entry.id} ` +
          `(attempts=${entry.attempts + 1}/${opts.llmMaxAttempts})`,
      );
      return;
    }
    await this.queueRepo.markFailed(entry.id, reason);
    this.logger.log(
      `queue entry ${entry.id} marked FAILED after ` +
        `${entry.attempts + 1} attempts: ${reason}`,
    );
  }
}
