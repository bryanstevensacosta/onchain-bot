import type { PublishingSession } from '../entities/publishing-session.entity';

/**
 * Publishing-session repository port (in-memory live, TypeORM deferred GAP-1).
 */
export abstract class PublishingSessionRepository {
  public abstract save(session: PublishingSession): Promise<void>;
  public abstract findById(id: string): Promise<PublishingSession | null>;
  public abstract list(): Promise<ReadonlyArray<PublishingSession>>;
  public abstract remove(id: string): Promise<boolean>;
}
