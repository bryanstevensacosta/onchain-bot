import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { TokenScoreRepository } from 'discovery/scoring/application/ports/token-score.repository';
import {
  TokenScoreMapper,
  TokenScoreView,
} from 'discovery/scoring/application/mappers/token-score.mapper';

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
    return TokenScoreMapper.toView(score);
  }
}
