import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { TokenScoreRepository } from 'token/scoring/application/ports/token-score.repository';
import {
  TokenScoreMapper,
  TokenScoreView,
} from 'token/scoring/application/mappers/token-score.mapper';

@Injectable()
export class GetTopScoresUseCase {
  public constructor(private readonly scoreRepo: TokenScoreRepository) {}

  public async execute(
    limit: number,
    minScore: number,
  ): Promise<ReadonlyArray<TokenScoreView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `minScore must be 0..100, got ${minScore}`,
        { minScore },
      );
    }
    const scores = await this.scoreRepo.findTopScores(limit, minScore);
    return scores.map((s) =>
      TokenScoreMapper.toView({
        id: s.id,
        chain: s.chain.value,
        address: s.address,
        score: s.score.value,
        tier: s.tier,
        classification: s.classification,
        sourceCount: s.sourceCount,
        mentionCount: s.mentionCount,
        avgKolReputation: s.avgKolReputation,
        breakdown: s.breakdown,
        scoredAt: s.scoredAt,
      }),
    );
  }
}
