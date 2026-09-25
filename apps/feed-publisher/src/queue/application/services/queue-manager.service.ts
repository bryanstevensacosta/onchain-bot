import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublisherQueueRepository } from '../../domain/ports/publisher-queue.repository';
import { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';
import type { PublisherQueueStatus } from '../../domain/publisher-queue-status';
import { QueueFullError } from 'shared/exceptions/feed-publisher.error';

export interface PublisherQueueCounts {
  readonly pending: number;
  readonly scheduled: number;
  readonly publishing: number;
  readonly published: number;
  readonly failed: number;
  readonly blocked: number;
  readonly total: number;
}

/**
 * QueueManager: single writer for the unified queue (todo 4).
 *
 * Owns the pending cap (`QUEUE_MAX_PENDING`, default 36 mirroring the
 * backend depth), oldest-first draining, TTL expiry, and counts. The cap
 * is strict: over-cap enqueues throw QueueFullError (409) — a deliberate
 * deviation from the backend overflow-eviction, so staging dashboards see
 * backpressure instead of silent drops. BullMQ over Redis (GAP-3) replaces
 * the in-memory repo without touching this class.
 */
@Injectable()
export class QueueManager {
  public constructor(
    private readonly repo: PublisherQueueRepository,
    private readonly config: ConfigService,
  ) {}

  public maxPending(): number {
    const raw = Number(this.config.get<string>('QUEUE_MAX_PENDING', '36'));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 36;
  }

  public async enqueue(entry: PublisherQueueEntry): Promise<void> {
    const pending = await this.repo.countByStatus('PENDING');
    if (pending >= this.maxPending()) {
      throw new QueueFullError(pending);
    }
    await this.repo.save(entry);
  }

  public async nextPending(): Promise<PublisherQueueEntry | null> {
    return this.repo.findNextPending();
  }

  public async save(entry: PublisherQueueEntry): Promise<void> {
    await this.repo.save(entry);
  }

  public async findTracked(
    channelId: string,
    messageId: number,
  ): Promise<PublisherQueueEntry | null> {
    return this.repo.findByChannelIdAndMessageId(channelId, messageId);
  }

  public async list(options?: {
    limit?: number;
    status?: PublisherQueueStatus;
  }): Promise<PublisherQueueEntry[]> {
    return this.repo.list(options);
  }

  public async counts(): Promise<PublisherQueueCounts> {
    const [pending, scheduled, publishing, published, failed, blocked] =
      await Promise.all([
        this.repo.countByStatus('PENDING'),
        this.repo.countByStatus('SCHEDULED'),
        this.repo.countByStatus('PUBLISHING'),
        this.repo.countByStatus('PUBLISHED'),
        this.repo.countByStatus('FAILED'),
        this.repo.countByStatus('BLOCKED'),
      ]);
    return {
      pending,
      scheduled,
      publishing,
      published,
      failed,
      blocked,
      total: pending + scheduled + publishing + published + failed + blocked,
    };
  }

  public async remove(id: string): Promise<boolean> {
    return this.repo.delete(id);
  }

  public async expireOlderThan(
    ttlMs: number,
    reason: string,
    now: Date = new Date(),
  ): Promise<number> {
    const stale = await this.repo.findStale(ttlMs, now);
    let expired = 0;
    for (const entry of stale) {
      entry.markFailed(reason);
      await this.repo.save(entry);
      expired += 1;
    }
    return expired;
  }
}
