import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { ThreadPublishFlowStatus } from '../../domain/thread-status';
import { ThreadRepository } from '../../domain/ports/thread.repository';
import { ThreadMessagePublisherPort } from '../../domain/ports/thread-message-publisher.port';
import { ThreadSchedulerService } from '../services/thread-scheduler.service';

export interface PublishThreadResult {
  readonly threadId: string;
  readonly status: ThreadPublishFlowStatus;
  readonly publishedIndexes: number[];
  readonly failureReason: string | null;
  readonly skipped: 'backoff' | 'terminal' | null;
}

/**
 * PublishThreadUseCase (spec §9 `publish-thread.use-case.ts`).
 *
 * Skeleton publisher: drives the failure matrix against the injected
 * `ThreadMessagePublisherPort` (in-memory recorder in v1, real
 * Threads Bot API from todo 7 — the use-case does not change).
 *
 * - Terminal threads (COMPLETED/FAILED): no-op, nothing attempted.
 * - Backoff-held IN_PROGRESS: skipped until `nextAttemptAt`.
 * - Per-message loop from `resumeIndex`: `ok` advances; `transient`
 *   stops with IN_PROGRESS (first message) or PARTIAL (later
 *   messages) + backoff; `critical` fails the thread terminally.
 * - A next message whose delay has not elapsed pauses the run as
 *   IN_PROGRESS awaiting that due time (no attempt burned).
 */
@Injectable()
export class PublishThreadUseCase {
  public constructor(
    private readonly threads: ThreadRepository,
    private readonly publisher: ThreadMessagePublisherPort,
    private readonly scheduler: ThreadSchedulerService,
  ) {}

  public async execute(
    threadId: string,
    now: Date = new Date(),
  ): Promise<PublishThreadResult> {
    const thread = await this.threads.findById(threadId);
    if (!thread) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Thread ${threadId} not found`,
      );
    }
    if (thread.status === 'COMPLETED' || thread.status === 'FAILED') {
      const state = thread.toPublishState();
      return {
        threadId: thread.id,
        status: state.status,
        publishedIndexes: [],
        failureReason: state.failureReason,
        skipped: 'terminal',
      };
    }
    if (!this.scheduler.isAttemptDue(thread, now)) {
      return {
        threadId: thread.id,
        status: thread.toPublishState().status,
        publishedIndexes: [],
        failureReason: thread.failureReason,
        skipped: 'backoff',
      };
    }
    thread.beginAttempt();
    const publishedIndexes: number[] = [];
    for (
      let index = thread.resumeIndex;
      index < thread.messages.length;
      index += 1
    ) {
      const message = thread.messages[index];
      const dueAt = this.scheduler.nextMessageDueAt(thread, now);
      if (dueAt !== null && now.getTime() < dueAt.getTime()) {
        thread.markAwaitingDelay(dueAt);
        await this.threads.save(thread);
        return {
          threadId: thread.id,
          status: thread.toPublishState().status,
          publishedIndexes,
          failureReason: thread.failureReason,
          skipped: null,
        };
      }
      const outcome = await this.publisher.publish({
        threadId: thread.id,
        index,
        content: message.content,
      });
      if (outcome.outcome === 'ok') {
        thread.markMessagePublished(index, outcome.remoteId);
        publishedIndexes.push(index);
        continue;
      }
      if (outcome.outcome === 'critical') {
        thread.markFailed(outcome.reason);
        await this.threads.save(thread);
        return {
          threadId: thread.id,
          status: 'FAILED',
          publishedIndexes,
          failureReason: outcome.reason,
          skipped: null,
        };
      }
      const retryAt = new Date(
        now.getTime() + this.scheduler.computeBackoffMs(thread.attempts),
      );
      if (publishedIndexes.length > 0 || thread.messagesPublished > 0) {
        thread.markPartial(outcome.reason, retryAt);
        await this.threads.save(thread);
        return {
          threadId: thread.id,
          status: 'PARTIAL',
          publishedIndexes,
          failureReason: outcome.reason,
          skipped: null,
        };
      }
      thread.markTransient(outcome.reason, retryAt);
      await this.threads.save(thread);
      return {
        threadId: thread.id,
        status: 'IN_PROGRESS',
        publishedIndexes,
        failureReason: outcome.reason,
        skipped: null,
      };
    }
    thread.markCompleted();
    await this.threads.save(thread);
    return {
      threadId: thread.id,
      status: 'COMPLETED',
      publishedIndexes,
      failureReason: null,
      skipped: null,
    };
  }
}
