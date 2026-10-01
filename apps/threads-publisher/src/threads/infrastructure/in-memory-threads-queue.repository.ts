import { Injectable } from '@nestjs/common';
import { ThreadsQueueEntry } from '../domain/threads-queue-entry.entity';
import { ThreadsQueueRepository } from '../ports/threads-queue.repository';

/**
 * In-memory queue (LIVE until TypeORM wiring; backend DATABASE_ENABLED=false pattern).
 * Enforces THREADS_MAX_QUEUE_DEPTH=100 with oldest-first overflow eviction.
 */
@Injectable()
export class InMemoryThreadsQueueRepository extends ThreadsQueueRepository {
  public static readonly MAX_DEPTH = 100;

  private readonly rows = new Map<string, ThreadsQueueEntry>();

  public async enqueue(entry: ThreadsQueueEntry): Promise<void> {
    await this.save(entry);
    const pending = (await this.listPending(Number.MAX_SAFE_INTEGER)).sort(
      (a, b) => a.queuedAt.getTime() - b.queuedAt.getTime(),
    );
    while (pending.length > InMemoryThreadsQueueRepository.MAX_DEPTH) {
      const oldest = pending.shift();
      if (oldest) {
        this.rows.delete(oldest.id);
      }
    }
  }

  public async findByChannelIdAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<ThreadsQueueEntry | null> {
    for (const row of this.rows.values()) {
      if (row.channelId === channelId && row.messageId === messageId) {
        return row;
      }
    }
    return null;
  }

  public async findNextPending(): Promise<ThreadsQueueEntry | null> {
    const pending = await this.listPending(1);
    return pending[0] ?? null;
  }

  public async listPending(limit: number): Promise<ThreadsQueueEntry[]> {
    return [...this.rows.values()]
      .filter((r) => r.status === 'PENDING')
      .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime())
      .slice(0, limit);
  }

  public async countPending(): Promise<number> {
    let n = 0;
    for (const row of this.rows.values()) {
      if (row.status === 'PENDING') {
        n += 1;
      }
    }
    return n;
  }

  public async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  public async save(entry: ThreadsQueueEntry): Promise<void> {
    this.rows.set(entry.id, entry);
  }
}
