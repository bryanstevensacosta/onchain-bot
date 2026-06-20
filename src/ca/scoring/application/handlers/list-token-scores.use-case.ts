import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { TokenScoreRepository } from 'ca/scoring/application/ports/token-score.repository';
import {
  TokenScoreMapper,
  TokenScoreView,
} from 'ca/scoring/application/mappers/token-score.mapper';

@Injectable()
export class ListTokenScoresUseCase {
  public constructor(private readonly scoreRepo: TokenScoreRepository) {}

  public async execute(limit: number): Promise<ReadonlyArray<TokenScoreView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    const scores = await this.scoreRepo.findRecent(limit);
    return scores.map((s) => TokenScoreMapper.toView(s));
  }
}
