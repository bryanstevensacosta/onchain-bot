import type { DashboardKpis } from './dashboard-kpis.port';

export abstract class DashboardKpisCachePort {
  public abstract get(): Promise<DashboardKpis | null>;
  public abstract set(value: DashboardKpis): Promise<void>;
  public abstract invalidate(): Promise<void>;
}
