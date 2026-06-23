import { Controller, Get } from '@nestjs/common';
import { GetDashboardKpisUseCase } from 'dashboard/application/handlers/get-dashboard-kpis.use-case';
import type { DashboardKpis } from 'dashboard/application/ports/dashboard-kpis.port';

/**
 * Aggregated dashboard KPIs.
 *
 * `GET /dashboard/kpis` returns the counts the KpiCards widget needs in
 * a single response. Replaces four polling endpoints that each fetched
 * 100 rows just to derive a count (activeKols/totalKols from kols
 * list, totalCalls from canonical recent, approved/rejected from
 * decision recent, published from publishing recent).
 */
@Controller('dashboard')
export class DashboardController {
  public constructor(private readonly getKpis: GetDashboardKpisUseCase) {}

  @Get('kpis')
  public kpis(): Promise<DashboardKpis> {
    return this.getKpis.execute();
  }
}
