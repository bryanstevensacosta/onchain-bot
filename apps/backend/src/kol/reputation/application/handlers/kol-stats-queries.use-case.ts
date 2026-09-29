/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL rating moved to
 * apps/kol-calls/src/tracking (TrackedMention + kol_window_stats +
 * GET /api/kol-rankings). Refactor target: delete this file at the
 * central FINAL REVIEW (C4-bis.3). Rollback: backend path stays wired.
 */
import { Injectable } from '@nestjs/common';
import { KolReputationRepository } from 'kol/reputation/application/ports/kol-reputation.repository';
import {
  KolReputation,
  KolConfidence,
} from 'kol/reputation/domain/value-objects/kol-reputation.vo';
import {
  KolReputationMapper,
  KolReputationView,
} from 'kol/reputation/application/mappers/kol-reputation.mapper';

@Injectable()
export class GetKolReputationUseCase {
  public constructor(private readonly statsRepo: KolReputationRepository) {}

  public async execute(kolId: string): Promise<KolReputationView> {
    const stats = await this.statsRepo.findByKol(kolId);
    return KolReputationMapper.toView(stats ?? KolReputation.empty(kolId));
  }
}

@Injectable()
export class GetTopKolsUseCase {
  public constructor(private readonly statsRepo: KolReputationRepository) {}

  public async execute(
    limit: number,
    minConfidence?: KolConfidence,
  ): Promise<ReadonlyArray<KolReputationView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new Error(`Invalid limit: ${limit}`);
    }
    const stats = await this.statsRepo.findTop(limit, minConfidence);
    return stats.map((s) => KolReputationMapper.toView(s));
  }
}

@Injectable()
export class ListAllKolReputationsUseCase {
  public constructor(private readonly statsRepo: KolReputationRepository) {}

  public async execute(): Promise<ReadonlyArray<KolReputationView>> {
    const stats = await this.statsRepo.findAll();
    return stats.map((s) => KolReputationMapper.toView(s));
  }
}
