import { Injectable, Logger } from '@nestjs/common';
import { PublisherThrottleStateRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-throttle-state.repository';
import { loadCryptoNewsPublisherConfig } from 'telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config';

/**
 * Result of asking the throttle scheduler whether the publisher is
 * allowed to fire right now.
 */
export interface ThrottleDecision {
  readonly canPublish: boolean;
  /** Delay (ms) the next publish is required to wait for, when
   *  `canPublish=false`. Zero when publishing is allowed immediately. */
  readonly nextDelayMs: number;
}

/**
 * Application service: enforces the crypto-news publisher's
 * random-delay rule between consecutive publishes.
 *
 * The rule (see plan §T5 of `.omo/plans/crypto-news-publisher.md`):
 *   - The very first publish is allowed immediately (no prior history).
 *   - Each subsequent publish must wait between
 *     `randomDelayMinMs` and `randomDelayMaxMs` (config) since the
 *     `lastPublishAt` persisted in the throttle-state row. The exact
 *     wait time is randomized per call so the cron publisher doesn't
 *     pulse at fixed intervals.
 *
 * Persistence: `PublisherThrottleStateRepository` (single-row table,
 * `id=1`). The state is persisted — NOT in-memory — so a backend
 * restart does not reset the throttle and let the cron fire a burst
 * of publishes immediately after boot.
 *
 * Configurable bounds live in
 * `crypto-news-publisher.config.json` (`publishing.randomDelayMinMs`,
 * `publishing.randomDelayMaxMs`). The plan's spec gives the default
 * formula `Math.floor(3 + Math.random() * 12) * 60_000` (3-15 min) —
 * when no config file is present those bounds are used so the spec
 * is honoured in dev/CI as well.
 */
@Injectable()
export class ThrottleSchedulerService {
  private readonly logger = new Logger(ThrottleSchedulerService.name);
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;

  public constructor(
    private readonly throttleStateRepo: PublisherThrottleStateRepository,
  ) {
    const cfg = loadCryptoNewsPublisherConfig();
    this.minDelayMs = cfg.publishing.randomDelayMinMs;
    this.maxDelayMs = cfg.publishing.randomDelayMaxMs;
  }

  /**
   * Read the last publish timestamp from persistence. Returns `null`
   * on first boot (no row yet).
   */
  public async getLastPublishAt(): Promise<Date | null> {
    return this.throttleStateRepo.getLastPublishAt();
  }

  /**
   * Persist `at` as the new `lastPublishAt`. Called by the cron
   * publisher after a successful send so the next tick respects the
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
   * Draw a random delay in [minDelayMs, maxDelayMs] using the spec's
   * formula shape: an integer uniformly distributed in the range.
   */
  private randomDelayMs(): number {
    const span = Math.max(0, this.maxDelayMs - this.minDelayMs);
    return this.minDelayMs + Math.floor(Math.random() * (span + 1));
  }
}
