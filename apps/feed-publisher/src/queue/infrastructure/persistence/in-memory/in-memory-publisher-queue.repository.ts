import { Injectable } from '@nestjs/common';
import { PublisherQueueEntry } from '../../../domain/publisher-queue-entry.entity';
import { PublisherQueueRepository } from '../../../domain/ports/publisher-queue.repository';
import type { PublisherQueueListOptions } from '../../../domain/ports/publisher-queue.repository';
import type { PublisherQueueStatus } from '../../../domain/publisher-queue-status';

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;

/**
 * In-memory `PublisherQueueRepository` — the LIVE binding until GAP-1.
 *
 * Oldest-first PENDING drain (by queuedAt), newest-first display list.
 * No cap logic here: QueueManager owns QueueFullError.
 */
@Injectable()
export class InMemoryPublisherQueueRepository extends PublisherQueueRepository {
  private readonly rows = new Map<string, PublisherQueueEntry>();

  public async save(entry: PublisherQueueEntry): Promise<void> {
    this.rows.set(entry.id, entry);
  }

  public async findById(id: string): Promise<PublisherQueueEntry | null> {
    return this.rows.get(id) ?? null;
  }

  public async findByChannelIdAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<PublisherQueueEntry | null> {
    for (const entry of this.rows.values()) {
      if (entry.channelId === channelId && entry.messageId === messageId) {
        return entry;
      }
    }
    return null;
  }

  public async findNextPending(): Promise<PublisherQueueEntry | null> {
    let oldest: PublisherQueueEntry | null = null;
    for (const entry of this.rows.values()) {
      if (entry.status !== 'PENDING') {
        continue;
      }
      if (
        oldest === null ||
        entry.queuedAt.getTime() < oldest.queuedAt.getTime()
      ) {
        oldest = entry;
      }
    }
    return oldest;
  }

  public async list(
    options?: PublisherQueueListOptions,
  ): Promise<PublisherQueueEntry[]> {
    const limit = Math.min(
      Math.max(options?.limit ?? DEFAULT_LIST_LIMIT, 1),
      MAX_LIST_LIMIT,
    );
    const status: PublisherQueueStatus | undefined = options?.status;
    return [...this.rows.values()]
      .filter((entry) => status === undefined || entry.status === status)
      .sort((a, b) => b.queuedAt.getTime() - a.queuedAt.getTime())
      .slice(0, limit);
  }

  public async countByStatus(status: PublisherQueueStatus): Promise<number> {
    let count = 0;
    for (const entry of this.rows.values()) {
      if (entry.status === status) {
        count += 1;
      }
    }
    return count;
  }

  public async findStale(
    olderThanMs: number,
    now: Date = new Date(),
  ): Promise<PublisherQueueEntry[]> {
    const cutoff = now.getTime() - olderThanMs;
    return [...this.rows.values()]
      .filter(
        (entry) =>
          (entry.status === 'PENDING' || entry.status === 'SCHEDULED') &&
          entry.queuedAt.getTime() <= cutoff,
      )
      .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime());
  }

  public async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}
