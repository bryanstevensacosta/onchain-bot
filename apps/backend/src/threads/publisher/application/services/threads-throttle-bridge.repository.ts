import { Injectable } from '@nestjs/common';
import { SharedThrottleState } from 'telegram/shared/domain/entities/shared-throttle-state.entity';
import { SharedThrottleStateRepository } from 'telegram/shared/application/ports/shared-throttle-state.repository';
import { ThreadsThrottleState } from 'threads/publisher/domain/entities/threads-throttle-state.entity';
import { ThreadsThrottleStateRepository } from 'threads/publisher/application/ports/threads-throttle-state.repository';

/**
 * Bridge: exposes the Threads throttle row through the shared
 * `SharedThrottleStateRepository` port so the shared
 * `SharedThrottleSchedulerService` (one class serving N BCs with
 * different bounds) can drive the Threads publish throttle.
 *
 * Read-only delegation — no `telegram/**` file is modified; the
 * Threads row (`threads_throttle_states`, id=1) remains the single
 * source of truth.
 */
@Injectable()
export class ThreadsThrottleBridgeRepository extends SharedThrottleStateRepository {
  public constructor(
    private readonly threadsThrottleRepo: ThreadsThrottleStateRepository,
  ) {
    super();
  }

  public async load(): Promise<SharedThrottleState> {
    const at = await this.threadsThrottleRepo.getLastPublishAt();
    return SharedThrottleState.fromLastPublishAt(at);
  }

  public async save(state: SharedThrottleState): Promise<void> {
    await this.threadsThrottleRepo.save(
      ThreadsThrottleState.fromLastPublishAt(state.lastPublishAt),
    );
  }

  public async getLastPublishAt(): Promise<Date | null> {
    return this.threadsThrottleRepo.getLastPublishAt();
  }

  public async setLastPublishAt(at: Date): Promise<void> {
    return this.threadsThrottleRepo.setLastPublishAt(at);
  }
}
