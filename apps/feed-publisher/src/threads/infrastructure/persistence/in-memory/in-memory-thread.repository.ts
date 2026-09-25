import { Injectable } from '@nestjs/common';
import { Thread } from '../../../domain/entities/thread.entity';
import { ThreadRepository } from '../../../domain/ports/thread.repository';

const DEFAULT_DUE_LIMIT = 10;
const MAX_DUE_LIMIT = 100;

/**
 * In-memory `ThreadRepository` — the LIVE binding until GAP-1.
 *
 * Oldest-first due order (by createdAt). No cap logic here: the cron
 * owns the batch limit.
 */
@Injectable()
export class InMemoryThreadRepository extends ThreadRepository {
  private readonly rows = new Map<string, Thread>();

  public async save(thread: Thread): Promise<void> {
    this.rows.set(thread.id, thread);
  }

  public async findById(id: string): Promise<Thread | null> {
    return this.rows.get(id) ?? null;
  }

  public async findDueToPublish(now: Date, limit: number): Promise<Thread[]> {
    const safe = Math.min(
      Math.max(limit || DEFAULT_DUE_LIMIT, 1),
      MAX_DUE_LIMIT,
    );
    return [...this.rows.values()]
      .filter((thread) => thread.isDue(now))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, safe);
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }
}
