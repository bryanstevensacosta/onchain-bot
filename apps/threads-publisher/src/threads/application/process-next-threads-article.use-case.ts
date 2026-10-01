import { Injectable, Logger } from '@nestjs/common';
import { ThreadsQueueRepository } from '../ports/threads-queue.repository';
import { ThreadsApiPublisherPort } from '../ports/threads-api-publisher.port';
import { ThreadsLlmConfig } from '../domain/threads-llm-config.entity';
import { ThreadsThrottleState } from '../domain/threads-throttle-state.entity';

/**
 * Drain use-case (backend parity): 1/tick, dailyCap default 60,
 * throttle 60s-300s, LLM-or-raw by flags, 6-state transitions.
 */
@Injectable()
export class ProcessNextThreadsArticleUseCase {
  public static readonly DAILY_CAP_DEFAULT = 60;

  private readonly logger = new Logger(ProcessNextThreadsArticleUseCase.name);
  private readonly throttle = new ThreadsThrottleState();
  private publishedToday = 0;
  private dayKey: string | null = null;

  public constructor(
    private readonly queueRepo: ThreadsQueueRepository,
    private readonly publisher: ThreadsApiPublisherPort,
  ) {}

  public async execute(
    config: ThreadsLlmConfig = ThreadsLlmConfig.default(),
  ): Promise<{ processed: boolean; reason: string }> {
    if (!config.publishingEnabled) {
      return { processed: false, reason: 'publishing disabled' };
    }
    const today = new Date().toISOString().slice(0, 10);
    if (this.dayKey !== today) {
      this.dayKey = today;
      this.publishedToday = 0;
    }
    const cap =
      config.dailyCap > 0
        ? config.dailyCap
        : ProcessNextThreadsArticleUseCase.DAILY_CAP_DEFAULT;
    if (this.publishedToday >= cap) {
      return { processed: false, reason: 'daily cap reached' };
    }
    const entry = await this.queueRepo.findNextPending();
    if (!entry) {
      return { processed: false, reason: 'queue empty' };
    }
    const now = new Date();
    if (!this.throttle.canPublish(now, cap, 60_000)) {
      return { processed: false, reason: 'throttled' };
    }
    entry.transitionTo('PUBLISHING');
    await this.queueRepo.save(entry);
    const text = entry.generatedContent ?? entry.rawContent;
    const result = await this.publisher.publish({ text });
    if (result.ok) {
      entry.transitionTo('PUBLISHED');
      entry.publishedRemoteId = result.remoteId;
      this.throttle.recordPublish(now);
      this.publishedToday += 1;
      await this.queueRepo.save(entry);
      return { processed: true, reason: 'published' };
    }
    entry.lastError = result.reason;
    entry.transitionTo(result.reintentable ? 'PENDING' : 'FAILED');
    await this.queueRepo.save(entry);
    this.logger.warn(`threads publish failed: ${result.reason}`);
    return { processed: false, reason: result.reason };
  }
}
