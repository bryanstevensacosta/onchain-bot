import { Injectable } from '@nestjs/common';
import { ThreadsThrottleState } from 'threads/publisher/domain/entities/threads-throttle-state.entity';
import { ThreadsThrottleStateRepository } from 'threads/publisher/application/ports/threads-throttle-state.repository';

/**
 * In-memory `ThreadsThrottleStateRepository` for specs and local wiring.
 *
 * Holds the singleton row (`id = 1`) in process memory. Starts
 * "never published" (`lastPublishAt = null`), so the very first
 * `shouldPublish()` call is allowed immediately — same as the
 * crypto-news `SharedThrottleState` semantics.
 */
@Injectable()
export class InMemoryThreadsThrottleStateRepository extends ThreadsThrottleStateRepository {
  private state: ThreadsThrottleState = ThreadsThrottleState.empty();

  public async load(): Promise<ThreadsThrottleState> {
    return this.state;
  }

  public async save(state: ThreadsThrottleState): Promise<void> {
    this.state = state;
  }

  public async getLastPublishAt(): Promise<Date | null> {
    return this.state.lastPublishAt;
  }

  public async setLastPublishAt(at: Date): Promise<void> {
    this.state = this.state.withLastPublishAt(at);
  }
}
