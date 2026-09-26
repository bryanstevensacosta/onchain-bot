import { ScheduledPost } from '../../../domain/scheduled-post.entity';
import { ScheduledPostRepository } from '../../../domain/ports/scheduled-post.repository';

export class InMemoryScheduledPostRepository extends ScheduledPostRepository {
  private readonly rows = new Map<string, ScheduledPost>();

  public async save(post: ScheduledPost): Promise<ScheduledPost> {
    this.rows.set(post.id, post);
    return post;
  }

  public async findById(id: string): Promise<ScheduledPost | null> {
    return this.rows.get(id) ?? null;
  }

  public async findBySessionKey(
    sessionId: string,
    idempotencyKey: string,
  ): Promise<ScheduledPost | null> {
    for (const post of this.rows.values()) {
      const snap = post.toSnapshot();
      if (
        snap.sessionId === sessionId &&
        snap.idempotencyKey === idempotencyKey
      ) {
        return post;
      }
    }
    return null;
  }

  public async findScheduled(): Promise<ScheduledPost[]> {
    return [...this.rows.values()].filter((post) => post.state === 'scheduled');
  }

  public async findBySession(sessionId: string): Promise<ScheduledPost[]> {
    return [...this.rows.values()].filter(
      (post) => post.sessionId === sessionId,
    );
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }
}
