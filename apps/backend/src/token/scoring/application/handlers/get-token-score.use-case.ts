import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainId } from 'chain/identity/chain-id.vo';
import { TokenScoreRepository } from 'token/scoring/application/ports/token-score.repository';
import {
  TokenScoreMapper,
  TokenScoreView,
} from 'token/scoring/application/mappers/token-score.mapper';

@Injectable()
export class GetTokenScoreUseCase {
  public constructor(private readonly scoreRepo: TokenScoreRepository) {}

  public async execute(
    chain: string,
    address: string,
  ): Promise<TokenScoreView> {
    const chainVo = ChainId.fromString(chain);
    const score = await this.scoreRepo.findByChainAndAddress(
      chainVo,
      address.toLowerCase(),
    );
    if (!score) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `TokenScore not found: ${chain}:${address}`,
        { chain, address },
      );
    }
    return TokenScoreMapper.toView({
      id: score.id,
      chain: score.chain.value,
      address: score.address,
      score: score.score.value,
      tier: score.tier,
      classification: score.classification,
      sourceCount: score.sourceCount,
      mentionCount: score.mentionCount,
      avgKolReputation: score.avgKolReputation,
      breakdown: score.breakdown,
      scoredAt: score.scoredAt,
    });
  }
}
