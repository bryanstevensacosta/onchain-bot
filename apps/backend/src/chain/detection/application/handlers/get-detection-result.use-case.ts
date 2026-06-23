import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainDetectionRepository } from 'chain/detection/application/ports/chain-detection.repository';
import {
  ChainDetectionResultMapper,
  ChainDetectionResultView,
} from 'chain/detection/application/mappers/chain-detection-result.mapper';

@Injectable()
export class GetDetectionResultUseCase {
  public constructor(private readonly resultRepo: ChainDetectionRepository) {}

  public async execute(address: string): Promise<ChainDetectionResultView> {
    const normalized = address.toLowerCase();
    const result = await this.resultRepo.findByAddress(normalized);
    if (!result) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `ChainDetectionResult not found: ${normalized}`,
        { address: normalized },
      );
    }
    return ChainDetectionResultMapper.toView(result);
  }
}
