/**
 * @deprecated Moved to apps/kol-calls/src/normalization/ (Tramo 1, todo 7 + P18 companion).
 * Normalization as mention-index now lives in kol-calls: NormalizeCallUseCase →
 * (contract, kol, messageId) index WITHOUT collapse ("one card per coin" explicitly
 * derogated per P1). This file stays wired for dual-run; it will be removed in
 * todo 16 (cutover + cleanup). Do not extend it — add normalization logic in
 * apps/kol-calls/src/normalization/ instead.
 *
 * New location: apps/kol-calls/src/normalization/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainFamily } from 'chain/identity/chain-family.vo';
import { NormalizedAddress } from 'token/identity/normalized-address.vo';
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
