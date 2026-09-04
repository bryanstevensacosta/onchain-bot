import { Injectable } from '@nestjs/common';
import { IngestionSafetyConfig } from 'telegram/ingestion/shared/infrastructure/config/ingestion-safety.config';

/**
 * @deprecated This service is deprecated and will be removed in a future version.
 *
 * **Reason for deprecation:**
 * Sleep window management (pausing operations during high-risk periods) has been centralized
 * into the ingestion service. Distributed MTProto clients cannot coordinate sleep windows
 * effectively, and each environment sleeping independently provides no anti-ban benefit.
 *
 * **Migration path:**
 * - **New location:** `apps/ingestion-service/src/telegram/shared/infrastructure/services/sleep-window.service.ts`
 * - **Backend impact:** Backend clients do not need sleep window logic. The centralized
 *   ingestion service pauses all polling operations during configured sleep hours, and backends
 *   simply receive no messages during those periods (SSE streams remain connected but idle).
 *
 * **What moved to ingestion service:**
 * - Configurable sleep window hours (default 04:00-08:00 UTC) per Requirement 11.3
 * - Daily rotation logic to vary sleep times and mimic human behavior
 * - Active sleep state checking to pause all Telegram API operations
 * - Health endpoint reports "sleeping" status with next wake time
 *
 * **Anti-ban rationale:**
 * Per Telegram API Terms of Service, automated monitoring systems observe all unofficial
 * clients for spam/flood patterns. Sleep windows reduce activity during low-value periods
 * and create more natural-looking usage patterns, reducing ban risk from 24/7 operation.
 *
 * **Specification:** See `.kiro/specs/centralized-ingestion-service/requirements.md`
 * Requirement 11.3 for sleep window design and configuration options.
 *
 * @see {@link apps/ingestion-service} Centralized sleep windows coordinate anti-ban behavior
 */
@Injectable()
export class SleepWindowService {
  private readonly baseStartUtc: number;
  private readonly baseEndUtc: number;
  private rotationMinutes = 0;
  private lastRotationDate = '';

  constructor(private readonly config: IngestionSafetyConfig) {
    this.baseStartUtc = config.sleepStartUtc;
    this.baseEndUtc = config.sleepEndUtc;
  }

  public isAsleep(): boolean {
    this.ensureRotation();
    const now = new Date();
    const totalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const startMin = this.baseStartUtc * 60 + this.rotationMinutes;
    const endMin = this.baseEndUtc * 60 + this.rotationMinutes;

    // Normal case (e.g., 4-8): sleep between start and end
    if (startMin < endMin) {
      return totalMinutes >= startMin && totalMinutes < endMin;
    }

    // Overnight case (e.g., 18-10): sleep after start OR before end
    // This means: from start (e.g., 18:00) to end next day (e.g., 10:00)
    return totalMinutes >= startMin || totalMinutes < endMin;
  }

  public getNextWakeTime(): Date | null {
    if (!this.isAsleep()) return null;
    const now = new Date();
    const endMin = this.baseEndUtc * 60 + this.rotationMinutes;
    const wake = new Date(now);
    wake.setUTCHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
    if (wake <= now) wake.setUTCDate(wake.getUTCDate() + 1);
    return wake;
  }

  public rotateWindow(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today === this.lastRotationDate) return;
    this.lastRotationDate = today;
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
        86_400_000,
    );
    this.rotationMinutes = (dayOfYear % 61) - 30;
  }

  private ensureRotation(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastRotationDate) this.rotateWindow();
  }
}
