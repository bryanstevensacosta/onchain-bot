import { Injectable } from '@nestjs/common';

/**
 * @deprecated This service is deprecated and will be removed in a future version.
 *
 * **Reason for deprecation:**
 * FLOOD_WAIT occurrence tracking has been centralized into the ingestion service for unified
 * monitoring and alerting. With distributed MTProto clients, each environment tracks errors
 * independently, making it impossible to assess the true ban risk to the Telegram account.
 *
 * **Migration path:**
 * - **New location:** `apps/ingestion-service/src/telegram/shared/infrastructure/services/flood-wait-counter.service.ts`
 * - **Backend impact:** Backend clients do not need FLOOD_WAIT tracking. The centralized
 *   ingestion service exposes FLOOD_WAIT metrics via its health endpoint.
 *
 * **What moved to ingestion service:**
 * - 24-hour sliding window FLOOD_WAIT occurrence tracking (Requirement 11.2)
 * - Max wait duration tracking (exposes highest FLOOD_WAIT_X value in 24h)
 * - Consecutive failure counting for high-ban-risk alerting (Requirement 11.7)
 * - Metrics exposed via `/api/health` endpoint for monitoring dashboards
 *
 * **Monitoring integration:**
 * The ingestion service health endpoint reports:
 * - `floodWait.count24h`: Total FLOOD_WAIT errors in last 24 hours
 * - `floodWait.maxSeconds24h`: Longest wait duration encountered
 * - `floodWait.consecutiveFailures`: Current streak of failures
 * - Alert condition: >10 occurrences in 24h or >3 consecutive failures (high-ban-risk)
 *
 * **Specification:** See `.kiro/specs/centralized-ingestion-service/requirements.md`
 * Requirement 11.7 for metrics exposure and alerting thresholds.
 *
 * @see {@link apps/ingestion-service} Centralized FLOOD_WAIT metrics for unified monitoring
 */
@Injectable()
export class FloodWaitCounterService {
  private readonly records: Array<{ timestamp: number; seconds: number }> = [];

  public record(seconds: number): void {
    this.prune();
    this.records.push({ timestamp: Date.now(), seconds });
  }

  public get count24h(): number {
    this.prune();
    return this.records.length;
  }

  public get maxSeconds24h(): number {
    this.prune();
    if (this.records.length === 0) return 0;
    return Math.max(...this.records.map((r) => r.seconds));
  }

  public reset(): void {
    this.records.length = 0;
  }

  private prune(): void {
    const cutoff = Date.now() - 86_400_000;
    while (this.records.length > 0 && this.records[0].timestamp < cutoff) {
      this.records.shift();
    }
  }
}
