import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { HoneypotAnalysisRepository } from 'discovery/honeypot/application/ports/honeypot-analysis.repository';
import {
  HoneypotAnalysisView,
  HoneypotAnalysisMapper,
} from 'discovery/honeypot/application/mappers/honeypot-analysis.mapper';

@Injectable()
export class GetHoneypotAnalysisUseCase {
  public constructor(private readonly repo: HoneypotAnalysisRepository) {}

  public async execute(
    chain: string,
    address: string,
  ): Promise<HoneypotAnalysisView> {
    const chainVo = ChainId.fromString(chain);
    const analysis = await this.repo.findByChainAndAddress(
      chainVo,
      address.toLowerCase(),
    );
    if (!analysis) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `HoneypotAnalysis not found: ${chain}:${address}`,
        { chain, address },
      );
    }
    return HoneypotAnalysisMapper.toView(analysis);
  }
}
