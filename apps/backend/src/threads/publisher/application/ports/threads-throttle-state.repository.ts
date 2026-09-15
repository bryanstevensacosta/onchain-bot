import { ThreadsThrottleState } from 'threads/publisher/domain/entities/threads-throttle-state.entity';

/**
 * Outbound port: persistence for the Threads publish-throttle state.
 *
 * Threads-typed mirror of `SharedThrottleStateRepository`
 * (`telegram/shared/application/ports/shared-throttle-state.repository.ts`).
 * Backed by a single-row table (`id=1`). Returns an "empty" state
 * (lastPublishAt=null) when no row exists yet.
 *
 * Two access shapes:
 * - `load()` / `save(state)` — domain-typed.
 * - `getLastPublishAt()` / `setLastPublishAt(at)` — primitive-typed
 *   convenience methods used by the cron publisher path.
 */
export abstract class ThreadsThrottleStateRepository {
  public abstract load(): Promise<ThreadsThrottleState>;
  public abstract save(state: ThreadsThrottleState): Promise<void>;
  public abstract getLastPublishAt(): Promise<Date | null>;
  public abstract setLastPublishAt(at: Date): Promise<void>;
}
