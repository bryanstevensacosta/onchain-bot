import { Injectable } from '@nestjs/common';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { FilterDecisionRepository } from 'token/token-gating/application/ports/filter-decision.repository';
import { PublishedCallRepository } from 'telegram/shared';
import type { DashboardKpis } from '../ports/dashboard-kpis.port';

/**
 * Composes the dashboard KPI snapshot from the four source BCs.
 *
 * Runs the four count queries in parallel — they're independent and
 * each maps to a single SQL `COUNT(*)` (or in-memory Map scan). This is
 * what the KpiCards widget polls every few seconds; the alternative was
 * fetching the latest 100 of three different lists just to call
 * `.length`, which wasted bandwidth and DB time.
 */
@Injectable()
export class GetDashboardKpisUseCase {
  public constructor(
    private readonly kolRepo: KolRepository,
    private readonly canonicalCallRepo: CanonicalTokenCallRepository,
    private readonly filterDecisionRepo: FilterDecisionRepository,
    private readonly publishedCallRepo: PublishedCallRepository,
  ) {}

  public async execute(): Promise<DashboardKpis> {
    const [kols, totalCanonicalCalls, verdicts, publishedCalls] =
      await Promise.all([
        this.kolRepo.findAll(),
        this.canonicalCallRepo.count(),
        this.filterDecisionRepo.countByVerdict(),
        this.publishedCallRepo.countPublished(),
      ]);

    let activeKols = 0;
    for (const k of kols) if (k.isActive) activeKols += 1;

    return {
      activeKols,
      totalKols: kols.length,
      totalCanonicalCalls,
      approvedDecisions: verdicts.approved,
      rejectedDecisions: verdicts.rejected,
      publishedCalls,
    };
  }
}
