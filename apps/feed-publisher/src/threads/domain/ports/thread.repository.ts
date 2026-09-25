import type { Thread } from '../entities/thread.entity';

/**
 * Thread store (in-memory LIVE, TypeORM shape unwired GAP-1).
 *
 * FK-less by design (mirrors the unified queue): message rows carry
 * `threadId`, never a database FK.
 */
export abstract class ThreadRepository {
  public abstract save(thread: Thread): Promise<void>;
  public abstract findById(id: string): Promise<Thread | null>;
  public abstract findDueToPublish(now: Date, limit: number): Promise<Thread[]>;
  public abstract count(): Promise<number>;
}
