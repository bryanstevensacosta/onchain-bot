import { Injectable, Logger } from '@nestjs/common';
import { IngestionSafetyConfig } from 'telegram/ingestion/shared/infrastructure/config/ingestion-safety.config';
import { FloodWaitCounterService } from 'telegram/ingestion/shared/infrastructure/services/flood-wait-counter.service';

/**
 * @deprecated This service is deprecated and will be removed in a future version.
 *
 * **Reason for deprecation:**
 * FLOOD_WAIT error handling and anti-ban protection logic has been centralized into the
 * ingestion service. Running distributed MTProto clients without coordinated flood protection
 * increases ban risk, as each environment independently tracks and responds to rate limits.
 * Telegram's automated monitoring systems (per ToS) require unified anti-spam behavior.
 *
 * **Migration path:**
 * - **New location:** `apps/ingestion-service/src/telegram/shared/infrastructure/services/flood-wait-handler.service.ts`
 * - **Backend impact:** Backend clients consuming SSE streams do not need FLOOD_WAIT handling.
 *   The centralized ingestion service absorbs all rate limit errors and implements exponential
 *   backoff, protecting the single MTProto session from bans.
 *
 * **What moved to ingestion service:**
 * - FLOOD_WAIT_X error detection and parsing (extracts wait duration from Telegram API errors)
 * - Exponential backoff with configurable multiplier and max delay (Requirement 11.2)
 * - Retry logic with max attempts tracking
 * - Consecutive failure counting for high-ban-risk alerting (Requirement 11.7)
 * - Pause state management to halt operations during mandatory wait periods
 *
 * **Telegram anti-ban compliance:**
 * Per Telegram API Terms of Service (https://core.telegram.org/api/terms) and Technical
 * Limits (https://core.telegram.org/api/errors), FLOOD_WAIT errors indicate exceeding rate
 * limits and must be respected to avoid permanent account bans. The centralized service
 * ensures consistent compliance across all backend environments.
 *
 * **Specification:** See `.kiro/specs/centralized-ingestion-service/requirements.md`
 * Requirement 11.2 for FLOOD_WAIT handling design and section "External Constraints and
 * Regulatory Compliance" for Telegram ToS details.
 *
 * @see {@link apps/ingestion-service} Centralized anti-ban protection prevents account suspension
 * @see FloodWaitCounterService Also deprecated, tracks FLOOD_WAIT occurrences in 24h window
 */
@Injectable()
export class FloodWaitHandlerService {
  private readonly logger = new Logger(FloodWaitHandlerService.name);
  private pausedUntil: Date | null = null;
  private consecutiveFailures = 0;

  constructor(
    private readonly config: IngestionSafetyConfig,
    private readonly counter: FloodWaitCounterService,
  ) {}

  public get isPaused(): boolean {
    return this.pausedUntil !== null && this.pausedUntil > new Date();
  }

  public get pausedUntilDate(): Date | null {
    return this.pausedUntil;
  }

  public async withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.config.floodMaxAttempts; attempt++) {
      try {
        const result = await fn();
        this.consecutiveFailures = 0;
        return result;
      } catch (err) {
        const seconds = this.extractWaitSeconds(err);
        if (seconds === null) {
          throw err;
        }
        this.counter.record(seconds);
        lastError = err instanceof Error ? err : new Error(String(err));
        const waitMs = Math.min(
          this.config.floodInitialMs *
            this.config.floodMultiplier ** (attempt - 1),
          this.config.floodMaxMs,
        );
        const actualWait = Math.max(seconds * 1000, waitMs);
        this.consecutiveFailures = attempt;
        this.logger.warn(
          `[${label}] FLOOD_WAIT attempt ${attempt}/${this.config.floodMaxAttempts}: ` +
            `${seconds}s wait, backing off ${actualWait}ms`,
        );
        if (attempt >= this.config.floodMaxAttempts) {
          this.pausedUntil = new Date(Date.now() + 3_600_000);
          this.logger.error(
            `[${label}] ${this.config.floodMaxAttempts} consecutive FLOOD_WAITs — ` +
              `pausing until ${this.pausedUntil.toISOString()}`,
          );
          break;
        }
        await this.sleep(actualWait);
      }
    }
    throw lastError ?? new Error('Max FLOOD_WAIT retries exceeded');
  }

  public resetPause(): void {
    this.pausedUntil = null;
    this.consecutiveFailures = 0;
  }

  private extractWaitSeconds(err: unknown): number | null {
    const obj = err as Record<string, unknown>;
    if (obj && typeof obj.seconds === 'number') {
      return obj.seconds;
    }
    if (err instanceof Error) {
      // Only treat errors that explicitly carry the FLOOD_WAIT marker
      // as flood-wait. Otherwise non-FLOOD_WAIT errors (e.g. "Could not
      // find the input entity for {userId:2207386483}") get misread
      // as wait seconds and pause the listener for years.
      if (!/FLOOD_WAIT|FloodWaitError/i.test(err.message)) {
        return null;
      }
      const match = err.message.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    }
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
