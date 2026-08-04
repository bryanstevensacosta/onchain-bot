import { Inject, Injectable, Logger } from '@nestjs/common';
import { SharedThrottleStateRepository } from 'telegram/shared/application/ports/shared-throttle-state.repository';

/**
 * Result of asking the shared throttle scheduler whether a publisher
 * is allowed to fire right now.
 */
export interface ThrottleDecision {
  readonly canPublish: boolean;
  /** Delay (ms) the next publish is required to wait for, when
   *  `canPublish=false`. Zero when publishing is allowed immediately. */
  readonly nextDelayMs: number;
}

/**
 * Injectable bounds for a throttled publisher's random-delay window.
 * Injected (not read from config inside the service) so one service
 * class can serve multiple BCs with different inter-publish gaps
 * (e.g. crypto-news 3-15min, ads 30s-5min).
 */
export interface SharedThrottleBounds {
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
}

/**
 * Injection token carrying the concrete bounds for the bound
 * `SharedThrottleSchedulerService` instances.
 */
export const SHARED_THROTTLE_BOUNDS = 'SHARED_THROTTLE_BOUNDS';

/**
 * Application service: enforces a random-delay rule between
 * consecutive publishes for a shared throttle state.
 *
 * The rule:
 *   - The very first publish is allowed immediately (no prior history).
 *   - Each subsequent publish must wait between `minDelayMs` and
 *     `maxDelayMs` (injected bounds) since the `lastPublishAt`
 *     persisted in the throttle-state row. The exact wait time is
 *     randomized per call so the cron publisher doesn't pulse at fixed
 *     intervals.
 *
 * Persistence: `SharedThrottleStateRepository` (single-row table,
 * `id=1`). The bounds are constructor-injected via the
 * `SHARED_THROTTLE_BOUNDS` token so behavior is scope-parametrizable.
 */
@Injectable()
export class SharedThrottleSchedulerService {
  private readonly logger = new Logger(SharedThrottleSchedulerService.name);
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;

  public constructor(
    private readonly throttleStateRepo: SharedThrottleStateRepository,
    @Inject(SHARED_THROTTLE_BOUNDS) bounds: SharedThrottleBounds,
  ) {
    this.minDelayMs = bounds.minDelayMs;
    this.maxDelayMs = bounds.maxDelayMs;
  }

  /**
   * Read the last publish timestamp from persistence. Returns `null`
   * on first boot (no row yet).
   */
  public async getLastPublishAt(): Promise<Date | null> {
    return this.throttleStateRepo.getLastPublishAt();
  }

  /**
   * Persist `at` as the new `lastPublishAt`. Called by the publisher
   * after a successful send so the next tick respects the
   * random-delay window relative to this point.
   */
  public async setLastPublishAt(at: Date): Promise<void> {
    await this.throttleStateRepo.setLastPublishAt(at);
  }

  /**
   * Decide whether the publisher is allowed to fire right now.
   *
   * Algorithm:
   *   1. If no `lastPublishAt` → publish immediately.
   *   2. Otherwise pick a random `delayMs` in [minDelayMs, maxDelayMs].
   *   3. If `now - lastPublishAt >= delayMs` → publish.
   *   4. Otherwise `canPublish=false` and `nextDelayMs` is the
   *      remaining wait time.
   *
   * `nextDelayMs` is always non-negative: even when no prior publish
   * exists the value is `0` (publishing is allowed).
   */
  public async shouldPublish(now: Date): Promise<ThrottleDecision> {
    const lastPublishAt = await this.throttleStateRepo.getLastPublishAt();
    if (lastPublishAt === null) {
      return { canPublish: true, nextDelayMs: 0 };
    }
    const delayMs = this.randomDelayMs();
    const elapsedMs = now.getTime() - lastPublishAt.getTime();
    if (elapsedMs >= delayMs) {
      return { canPublish: true, nextDelayMs: 0 };
    }
    return { canPublish: false, nextDelayMs: delayMs - elapsedMs };
  }

  /**
   * Draw a random delay in [minDelayMs, maxDelayMs]: an integer
   * uniformly distributed in the range.
   */
  private randomDelayMs(): number {
    const span = Math.max(0, this.maxDelayMs - this.minDelayMs);
    return this.minDelayMs + Math.floor(Math.random() * (span + 1));
  }
}
