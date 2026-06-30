import { Injectable } from '@nestjs/common';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { VipCallApprovalDecisionRepository } from 'token/vip-call-approval/application/ports/vip-call-approval-decision.repository';
import { PublishedCallRepository } from 'telegram/shared';
import type { DashboardKpis } from '../ports/dashboard-kpis.port';
import { DashboardKpisCachePort } from '../ports/dashboard-kpis-cache.port';

/**
 * Composes the dashboard KPI snapshot from the four source BCs.
 *
 * Reads from a 1s TTL cache first (in-memory by default). On miss,
 * runs the four count queries in parallel — they're independent and
 * each maps to a single SQL `COUNT(*)` (or in-memory Map scan). The
 * computed snapshot is then stored in the cache for subsequent calls.
 */
@Injectable()
export class GetDashboardKpisUseCase {
  public constructor(
    private readonly kolRepo: KolRepository,
    private readonly canonicalCallRepo: CanonicalTokenCallRepository,
    private readonly filterDecisionRepo: VipCallApprovalDecisionRepository,
    private readonly publishedCallRepo: PublishedCallRepository,
    private readonly cache: DashboardKpisCachePort,
  ) {}

  public async execute(): Promise<DashboardKpis> {
    const cached = await this.cache.get();
    if (cached) return cached;

    const [kols, totalCanonicalCalls, verdicts, publishedCalls] =
      await Promise.all([
        this.kolRepo.findAll(),
        this.canonicalCallRepo.count(),
        this.filterDecisionRepo.countByVerdict(),
        this.publishedCallRepo.countPublished(),
      ]);

    let activeKols = 0;
    for (const k of kols) if (k.isActive) activeKols += 1;

    const snapshot: DashboardKpis = {
      activeKols,
      totalKols: kols.length,
      totalCanonicalCalls,
      approvedDecisions: verdicts.approved,
      rejectedDecisions: verdicts.rejected,
      publishedCalls,
    };

    await this.cache.set(snapshot);
    return snapshot;
  }
}
