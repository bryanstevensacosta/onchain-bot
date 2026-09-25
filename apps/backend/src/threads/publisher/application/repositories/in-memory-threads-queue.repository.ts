import { Injectable } from '@nestjs/common';
import { ThreadsQueueEntry } from 'threads/publisher/domain/entities/threads-queue-entry.entity';
import {
  ThreadsGeneratedPublishData,
  ThreadsQueueRepository,
} from 'threads/publisher/application/ports/threads-queue.repository';
import { EnqueueThreadsMessageUseCase } from 'threads/publisher/application/handlers/enqueue-threads-message.use-case';

/**
 * In-memory `ThreadsQueueRepository` for specs and local wiring.
 *
 * Enforces the same two invariants as the TypeORM counterpart:
 * - `(channelId, messageId)` uniqueness (duplicate `enqueue()` throws,
 *   mirroring the `uq_threads_queue_channel_message` constraint — the
 *   use case pre-checks via `findByChannelIdAndMessageId` so the throw
 *   is a backstop, never the happy path).
 * - `THREADS_MAX_QUEUE_DEPTH` cap: after INSERT, evict the oldest rows
 *   by `messageReceivedAt` ASC until at most 100 remain (mirrors the
 *   crypto-news INSERT + overflow-DELETE transaction).
 */
@Injectable()
export class InMemoryThreadsQueueRepository extends ThreadsQueueRepository {
  private readonly rows = new Map<string, ThreadsQueueEntry>();

  public async enqueue(entry: ThreadsQueueEntry): Promise<void> {
    const key = `${entry.channelId}:${entry.messageId}`;
    for (const existing of this.rows.values()) {
      if (`${existing.channelId}:${existing.messageId}` === key) {
        throw new Error(
          `InMemoryThreadsQueueRepository: duplicate (channelId,messageId)=(${entry.channelId},${entry.messageId})`,
        );
      }
    }
    this.rows.set(entry.id, entry);
    const cap = EnqueueThreadsMessageUseCase.THREADS_MAX_QUEUE_DEPTH;
    if (this.rows.size > cap) {
      const ordered = [...this.rows.values()].sort(
        (a, b) => a.messageReceivedAt.getTime() - b.messageReceivedAt.getTime(),
      );
      for (const victim of ordered.slice(0, this.rows.size - cap)) {
        this.rows.delete(victim.id);
      }
    }
  }

  public async findNextPending(): Promise<ThreadsQueueEntry | null> {
    const pending = [...this.rows.values()]
      .filter((e) => e.status === 'PENDING')
      .sort(
        (a, b) => a.messageReceivedAt.getTime() - b.messageReceivedAt.getTime(),
      );
    return pending[0] ?? null;
  }

  public async markPublished(
    id: string,
    threadsPostId: string,
    generated?: ThreadsGeneratedPublishData,
  ): Promise<ThreadsQueueEntry> {
    const entry = this.require(id);
    entry.markPublished(threadsPostId, {
      content: generated?.content ?? entry.rawContent,
      systemPrompt: generated?.systemPrompt ?? null,
      userPrompt: generated?.userPrompt ?? null,
      temperature: generated?.temperature ?? null,
      reasoningEffort: generated?.reasoningEffort ?? null,
      model: generated?.model ?? null,
    });
    return entry;
  }

  public async markFailed(
    id: string,
    reason: string,
  ): Promise<ThreadsQueueEntry> {
    const entry = this.require(id);
    entry.markFailed(reason);
    return entry;
  }

  public async incrementAttempts(id: string): Promise<ThreadsQueueEntry> {
    const entry = this.require(id);
    entry.incrementAttempts();
    return entry;
  }

  public async findAllForDisplay(
    limit: number,
  ): Promise<ReadonlyArray<ThreadsQueueEntry>> {
    return [...this.rows.values()]
      .sort(
        (a, b) => b.messageReceivedAt.getTime() - a.messageReceivedAt.getTime(),
      )
      .slice(0, limit);
  }

  public async countPublishedToday(resetHourUtc: number): Promise<number> {
    const now = new Date();
    const dayStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        resetHourUtc,
      ),
    );
    if (dayStart.getTime() > now.getTime()) {
      dayStart.setUTCDate(dayStart.getUTCDate() - 1);
    }
    return [...this.rows.values()].filter(
      (e) =>
        e.status === 'PUBLISHED' &&
        e.publishedAt !== null &&
        e.publishedAt.getTime() >= dayStart.getTime(),
    ).length;
  }

  public async countPending(): Promise<number> {
    return [...this.rows.values()].filter((e) => e.status === 'PENDING').length;
  }

  public async findById(id: string): Promise<ThreadsQueueEntry | null> {
    return this.rows.get(id) ?? null;
  }

  public async findByIdForDisplay(
    id: string,
  ): Promise<ThreadsQueueEntry | null> {
    return this.findById(id);
  }

  public async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  public async findPendingOlderThan(
    thresholdMs: number,
  ): Promise<ReadonlyArray<ThreadsQueueEntry>> {
    const cutoff = Date.now() - thresholdMs;
    return [...this.rows.values()]
      .filter((e) => e.status === 'PENDING' && e.queuedAt.getTime() < cutoff)
      .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime());
  }

  public async findByChannelIdAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<ThreadsQueueEntry | null> {
    const matches = [...this.rows.values()]
      .filter((e) => e.channelId === channelId && e.messageId === messageId)
      .sort(
        (a, b) => b.messageReceivedAt.getTime() - a.messageReceivedAt.getTime(),
      );
    return matches[0] ?? null;
  }

  private require(id: string): ThreadsQueueEntry {
    const entry = this.rows.get(id);
    if (!entry) {
      throw new Error(`InMemoryThreadsQueueRepository: entry ${id} not found`);
    }
    return entry;
  }
}
