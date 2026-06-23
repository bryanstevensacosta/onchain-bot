import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/normalization/domain/value-objects/normalized-address.vo';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import {
  CanonicalTokenCallMapper,
  CanonicalTokenCallView,
} from 'token/normalization/application/mappers/canonical-token-call.mapper';

@Injectable()
export class GetCanonicalCallUseCase {
  public constructor(private readonly callRepo: CanonicalTokenCallRepository) {}

  public async execute(
    chain: string,
    address: string,
  ): Promise<CanonicalTokenCallView> {
    const chainVo = ChainFamily.tryFromString(chain);
    if (!chainVo) {
      throw new DomainError(
        ErrorCode.UNSUPPORTED_CHAIN,
        `Unsupported chain: ${chain}`,
        { chain },
      );
    }
    const addressVo = NormalizedAddress.fromChainHint(address, chain);
    if (!addressVo) {
      throw new DomainError(
        ErrorCode.INVALID_ADDRESS,
        `Invalid address for chain ${chain}: ${address}`,
        { chain, address },
      );
    }
    const call = await this.callRepo.findByIdentity(chainVo, addressVo);
    if (!call) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `CanonicalTokenCall not found: ${chainVo.value}:${addressVo.value}`,
        { chain, address },
      );
    }
    return CanonicalTokenCallMapper.toView(call);
  }
}
