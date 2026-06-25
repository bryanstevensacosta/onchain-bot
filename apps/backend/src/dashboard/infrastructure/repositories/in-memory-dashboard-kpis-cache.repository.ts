import { Injectable, Logger } from '@nestjs/common';
import { DashboardKpisCachePort } from '../../application/ports/dashboard-kpis-cache.port';
import type { DashboardKpis } from '../../application/ports/dashboard-kpis.port';

interface CacheEntry {
  readonly value: DashboardKpis;
  readonly expiresAt: number;
}

/**
 * In-memory TTL cache for the dashboard KPI snapshot.
 *
 * Defaults to 1s TTL — short enough that dashboards stay near-real-time
 * without polling pressure on the 4 source BCs, long enough to coalesce
 * the N concurrent /dashboard/kpis requests from the N open browser
 * tabs.
 *
 * `process.env.DASHBOARD_CACHE_TTL_MS` overrides the default.
 */
@Injectable()
export class InMemoryDashboardKpisCacheRepository extends DashboardKpisCachePort {
  private readonly logger = new Logger(
    InMemoryDashboardKpisCacheRepository.name,
  );
  private readonly ttlMs: number;
  private entry: CacheEntry | null = null;

  public constructor() {
    super();
    const envTtl = process.env.DASHBOARD_CACHE_TTL_MS;
    this.ttlMs = envTtl ? parseInt(envTtl, 10) : 1_000;
  }

  public async get(): Promise<DashboardKpis | null> {
    if (!this.entry) return null;
    if (Date.now() > this.entry.expiresAt) {
      this.entry = null;
      return null;
    }
    return this.entry.value;
  }

  public async set(value: DashboardKpis): Promise<void> {
    this.entry = { value, expiresAt: Date.now() + this.ttlMs };
  }

  public async invalidate(): Promise<void> {
    this.logger.debug('invalidate()');
    this.entry = null;
  }
}
