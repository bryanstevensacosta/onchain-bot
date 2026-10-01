import { ScheduledPost } from '../scheduled-post.entity';

/**
 * Persistence port for contract posts (table `scheduled_posts`).
 * In-memory is LIVE; the TypeORM shape ships alongside (GAP-1 pattern).
 */
export abstract class ScheduledPostRepository {
  public abstract save(post: ScheduledPost): Promise<ScheduledPost>;
  public abstract findById(id: string): Promise<ScheduledPost | null>;
  public abstract findBySessionKey(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<ScheduledPost | null>;
  public abstract findScheduled(): Promise<ScheduledPost[]>;
  public abstract findBySession(sessionId: string): Promise<ScheduledPost[]>;
  public abstract count(): Promise<number>;
}
