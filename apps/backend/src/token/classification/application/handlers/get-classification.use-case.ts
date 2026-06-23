import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainId } from 'chain/identity/chain-id.vo';
import { TokenClassificationRepository } from 'token/classification/application/ports/token-classification.repository';
import {
  TokenClassificationMapper,
  TokenClassificationView,
} from 'token/classification/application/mappers/token-classification.mapper';

@Injectable()
export class GetClassificationUseCase {
  public constructor(private readonly repo: TokenClassificationRepository) {}

  public async execute(
    chain: string,
    address: string,
  ): Promise<TokenClassificationView> {
    const chainVo = ChainId.fromString(chain);
    const c = await this.repo.findByChainAndAddress(
      chainVo,
      address.toLowerCase(),
    );
    if (!c) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `TokenClassification not found: ${chain}:${address}`,
        { chain, address },
      );
    }
    return TokenClassificationMapper.toView(c);
  }
}
