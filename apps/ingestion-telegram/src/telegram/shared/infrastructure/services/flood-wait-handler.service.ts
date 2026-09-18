import { Injectable, Logger } from '@nestjs/common';
import { IngestionSafetyConfig } from '../config/ingestion-safety.config';
import { FloodWaitCounterService } from './flood-wait-counter.service';

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

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
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

        // Per Requirement 9.3: Structured logging for flood_wait detection
        this.logger.log({
          event: 'flood_wait:detected',
          waitSeconds: seconds,
          count24h: this.counter.count24h,
          backoffMs: actualWait,
          attempt,
          maxAttempts: this.config.floodMaxAttempts,
          label,
          timestamp: new Date().toISOString(),
        });

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
