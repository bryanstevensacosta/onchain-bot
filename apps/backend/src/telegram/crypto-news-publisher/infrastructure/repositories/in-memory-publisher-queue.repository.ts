import { Injectable } from '@nestjs/common';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import {
  GeneratedPublishData,
  PublisherQueueRepository,
} from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';

/**
 * In-memory implementation of PublisherQueueRepository (tests / local
 * no-DB runs). Mirrors the TypeORM variant, including the 36-entry
 * overflow cap and the 04:00-UTC-anchored `countPublishedToday` window.
 */
@Injectable()
export class InMemoryPublisherQueueRepository extends PublisherQueueRepository {
  private static readonly MAX_QUEUE_DEPTH = 36;
  private readonly store = new Map<string, PublisherQueueEntry>();

  public async enqueue(entry: PublisherQueueEntry): Promise<void> {
    this.store.set(entry.id, entry);
    const ordered = Array.from(this.store.values()).sort(
      (a, b) => b.messageReceivedAt.getTime() - a.messageReceivedAt.getTime(),
    );
    for (const overflow of ordered.slice(
      InMemoryPublisherQueueRepository.MAX_QUEUE_DEPTH,
    )) {
      this.store.delete(overflow.id);
    }
  }

  public async findNextPending(): Promise<PublisherQueueEntry | null> {
    const pending = Array.from(this.store.values())
      .filter((e) => e.status === 'PENDING')
      .sort(
        (a, b) => a.messageReceivedAt.getTime() - b.messageReceivedAt.getTime(),
      );
    return pending[0] ?? null;
  }

  public async markPublished(
    id: string,
    telegramMessageId: string,
    generated?: GeneratedPublishData,
  ): Promise<PublisherQueueEntry> {
    const entry = this.require(id);
    entry.markPublished(telegramMessageId, generated);
    return entry;
  }

  public async markFailed(
    id: string,
    reason: string,
  ): Promise<PublisherQueueEntry> {
    const entry = this.require(id);
    entry.markFailed(reason);
    return entry;
  }

  public async incrementAttempts(id: string): Promise<PublisherQueueEntry> {
    const entry = this.require(id);
    entry.incrementAttempts();
    return entry;
  }

  public async findAllForDisplay(
    limit: number,
  ): Promise<ReadonlyArray<PublisherQueueEntry>> {
    return Array.from(this.store.values())
      .sort(
        (a, b) => b.messageReceivedAt.getTime() - a.messageReceivedAt.getTime(),
      )
      .slice(0, limit);
  }

  public async countPublishedToday(resetHourUtc: number): Promise<number> {
    const now = new Date();
    const windowStart = new Date(now);
    if (now.getUTCHours() < resetHourUtc) {
      windowStart.setUTCDate(windowStart.getUTCDate() - 1);
    }
    windowStart.setUTCHours(resetHourUtc, 0, 0, 0);
    return Array.from(this.store.values()).filter(
      (e) =>
        e.status === 'PUBLISHED' &&
        e.publishedAt !== null &&
        e.publishedAt >= windowStart,
    ).length;
  }

  public async countPending(): Promise<number> {
    return Array.from(this.store.values()).filter((e) => e.status === 'PENDING')
      .length;
  }

  public async findById(id: string): Promise<PublisherQueueEntry | null> {
    return this.store.get(id) ?? null;
  }

  public async findByIdForDisplay(
    id: string,
  ): Promise<PublisherQueueEntry | null> {
    return this.findById(id);
  }

  public async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  public async findPendingOlderThan(
    thresholdMs: number,
  ): Promise<ReadonlyArray<PublisherQueueEntry>> {
    const cutoff = new Date(Date.now() - thresholdMs);
    return Array.from(this.store.values())
      .filter((e) => e.status === 'PENDING' && e.queuedAt < cutoff)
      .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime());
  }

  public async findByChannelIdAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<PublisherQueueEntry | null> {
    const matches = Array.from(this.store.values())
      .filter((e) => e.channelId === channelId && e.messageId === messageId)
      .sort(
        (a, b) => b.messageReceivedAt.getTime() - a.messageReceivedAt.getTime(),
      );
    return matches[0] ?? null;
  }

  private require(id: string): PublisherQueueEntry {
    const entry = this.store.get(id);
    if (!entry) {
      throw new Error(`Queue entry not found: ${id}`);
    }
    return entry;
  }
}
