import { Injectable } from '@nestjs/common';
import { QueueManager } from '../services/queue-manager.service';
import { QueuedArticleRendererPort } from '../ports/queued-article-renderer.port';
import { QueuedArticleDispatcherPort } from '../ports/queued-article-dispatcher.port';
import { QueueHealthState } from '../state/queue-health.state';
import { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';
import type { PublisherQueueStatus } from '../../domain/publisher-queue-status';
import { ConfigService } from '@nestjs/config';

export interface ProcessNextResult {
  readonly processed: boolean;
  readonly entryId?: string;
  readonly status?: PublisherQueueStatus;
}

/**
 * ProcessNextQueuedArticle: drain ONE entry per tick (todo 4 core).
 *
 * Moved from backend feed-publisher (todo 4), minus the LLM +
 * Telegram bindings (todos 5/7 own those): claim oldest PENDING ->
 * PUBLISHING, render (raw passthrough today), dispatch (in-memory
 * recorder today), PUBLISHED with the telegram id. Render/dispatch
 * failures retry via releaseToPending until `LLM_MAX_ATTEMPTS` (default
 * 3, shared with the future LLM gateway), then FAILED. "Not configured"
 * dispatch errors release WITHOUT consuming an attempt (mirrors the
 * backend: a missing bot token must not burn the queue).
 */
@Injectable()
export class ProcessNextQueuedArticleUseCase {
  public constructor(
    private readonly manager: QueueManager,
    private readonly renderer: QueuedArticleRendererPort,
    private readonly dispatcher: QueuedArticleDispatcherPort,
    private readonly health: QueueHealthState,
    private readonly config: ConfigService,
  ) {}

  private maxAttempts(): number {
    const raw = Number(this.config.get<string>('LLM_MAX_ATTEMPTS', '3'));
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 3;
  }

  public async execute(): Promise<ProcessNextResult> {
    const entry = await this.manager.nextPending();
    if (entry === null) {
      return { processed: false };
    }
    entry.markPublishing();
    await this.manager.save(entry);
    let content: string;
    try {
      const rendered = await this.renderer.render(entry);
      content = rendered.content;
      if (content === null || content === undefined || content === '') {
        return await this.failOrRetry(entry, 'Renderer returned empty content');
      }
    } catch (err) {
      return await this.failOrRetry(
        entry,
        `Renderer failed: ${(err as Error).message}`,
      );
    }
    try {
      const dispatched = await this.dispatcher.dispatch(entry, content);
      entry.markPublished(dispatched.telegramMessageId, { content });
      await this.manager.save(entry);
      this.health.recordProcessed();
      return { processed: true, entryId: entry.id, status: entry.status };
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('TOKEN') || message.includes('not configured')) {
        entry.releaseToPending();
        await this.manager.save(entry);
        this.health.recordFailure(message);
        return { processed: true, entryId: entry.id, status: entry.status };
      }
      return await this.failOrRetry(entry, `Dispatch failed: ${message}`);
    }
  }

  private async failOrRetry(
    entry: PublisherQueueEntry,
    reason: string,
  ): Promise<ProcessNextResult> {
    if (entry.attempts + 1 >= this.maxAttempts()) {
      entry.markFailed(reason);
      await this.manager.save(entry);
      this.health.recordFailure(reason);
      return { processed: true, entryId: entry.id, status: entry.status };
    }
    entry.incrementAttempts();
    entry.releaseToPending();
    await this.manager.save(entry);
    this.health.recordFailure(reason);
    return { processed: true, entryId: entry.id, status: entry.status };
  }
}
