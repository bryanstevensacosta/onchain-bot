import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { KolReputationRepository } from 'kol/reputation/application/ports/kol-reputation.repository';
import { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';
import { recomputeKolReputation } from 'kol/reputation/domain/services/recompute-kol-reputation.service';
import { CallPerformanceRepository } from 'token/call-tracking/application/ports/call-performance.repository';

export interface RecomputeKolReputationInput {
  readonly kolId: string;
}

/**
 * Use case: recompute reputation stats for a KOL from existing stored
 * performances (no fresh evaluation).
 *
 * Useful for: forced refresh, fixing drift after bulk evaluation jobs.
 */
@Injectable()
@Injectable()
export class RecomputeKolReputationUseCase {
  public constructor(
    @Inject(forwardRef(() => CallPerformanceRepository))
    private readonly performanceRepo: CallPerformanceRepository,
    private readonly statsRepo: KolReputationRepository,
  ) {}

  public async execute(
    input: RecomputeKolReputationInput,
  ): Promise<KolReputation> {
    const perfs = await this.performanceRepo.findByChannel(input.kolId);
    const stats = recomputeKolReputation(input.kolId, perfs);
    await this.statsRepo.save(stats);
    return stats;
  }
}
