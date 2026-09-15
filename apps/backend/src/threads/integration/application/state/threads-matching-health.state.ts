import { Injectable } from '@nestjs/common';

/**
 * In-memory holder for the threads matching pipeline health.
 *
 * Mirror of crypto `MatchingHealthState`: mutated ONLY by
 * `EnqueueThreadsCronScheduler`, read ONLY by
 * `ThreadsMatchingConfigController.getHealth()`. Never persisted — a
 * restart resets every field by design (queue depth is the only durable
 * signal, read live via `ThreadsQueueRepository.countPending()`).
 *
 * Field semantics:
 *  - `lastTickAt` — ISO timestamp of the last fetch attempt (success or
 *    failure). `null` until the first tick runs.
 *  - `lastFetchOk` — outcome of the last fetch attempt. `null` until the
 *    first tick runs.
 *  - `consecutiveFetchFailures` — fetch throws since the last success.
 *    Reset to 0 on every success.
 *  - `lastEnqueuedAt` — ISO timestamp of the last tick that enqueued at
 *    least one message. `null` when nothing was ever enqueued.
 */
@Injectable()
export class ThreadsMatchingHealthState {
  public lastTickAt: string | null = null;
  public lastFetchOk: boolean | null = null;
  public consecutiveFetchFailures = 0;
  public lastEnqueuedAt: string | null = null;

  public recordFetchSuccess(at: Date = new Date()): void {
    this.lastTickAt = at.toISOString();
    this.lastFetchOk = true;
    this.consecutiveFetchFailures = 0;
  }

  public recordFetchFailure(at: Date = new Date()): void {
    this.lastTickAt = at.toISOString();
    this.lastFetchOk = false;
    this.consecutiveFetchFailures += 1;
  }

  public recordEnqueued(at: Date = new Date()): void {
    this.lastEnqueuedAt = at.toISOString();
  }
}
