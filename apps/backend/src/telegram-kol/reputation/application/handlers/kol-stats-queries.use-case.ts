import { Injectable } from '@nestjs/common';
import { KolReputationRepository } from 'telegram-kol/reputation/application/ports/kol-reputation.repository';
import {
  KolReputation,
  KolConfidence,
} from 'telegram-kol/reputation/domain/value-objects/kol-reputation.vo';
import {
  KolReputationMapper,
  KolReputationView,
} from 'telegram-kol/reputation/application/mappers/kol-reputation.mapper';

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
