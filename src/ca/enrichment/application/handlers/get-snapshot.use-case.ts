import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { TokenSnapshotRepository } from 'ca/enrichment/application/ports/token-snapshot.repository';
import {
  TokenSnapshotMapper,
  TokenSnapshotView,
} from 'ca/enrichment/application/mappers/token-snapshot.mapper';

@Injectable()
export class GetSnapshotUseCase {
  public constructor(private readonly snapshotRepo: TokenSnapshotRepository) {}

  public async execute(
    chain: string,
    address: string,
  ): Promise<TokenSnapshotView> {
    const chainVo = ChainId.fromString(chain);
    const snapshot = await this.snapshotRepo.findByChainAndAddress(
      chainVo,
      address.toLowerCase(),
    );
    if (!snapshot) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `TokenSnapshot not found: ${chain}:${address}`,
        { chain, address },
      );
    }
    return TokenSnapshotMapper.toView(snapshot);
  }
}
