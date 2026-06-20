import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { PublishedCallRepository } from 'ca/publishing/telegram/application/ports/published-call.repository';
import {
  PublishedCallMapper,
  PublishedCallView,
} from 'ca/publishing/telegram/application/mappers/published-call.mapper';

@Injectable()
export class GetPublishedCallUseCase {
  public constructor(private readonly callRepo: PublishedCallRepository) {}

  public async execute(
    chain: string,
    address: string,
  ): Promise<PublishedCallView> {
    const chainVo = ChainId.fromString(chain);
    const call = await this.callRepo.findByChainAndAddress(
      chainVo,
      address.toLowerCase(),
    );
    if (!call) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `PublishedCall not found: ${chain}:${address}`,
        { chain, address },
      );
    }
    return PublishedCallMapper.toView(call);
  }
}
