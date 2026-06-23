import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ChainDetectionRepository } from 'chain/detection/application/ports/chain-detection.repository';
import {
  ChainDetectionResultMapper,
  ChainDetectionResultView,
} from 'chain/detection/application/mappers/chain-detection-result.mapper';

@Injectable()
export class ListDetectionResultsUseCase {
  public constructor(private readonly resultRepo: ChainDetectionRepository) {}

  public async execute(
    limit: number,
  ): Promise<ReadonlyArray<ChainDetectionResultView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    const results = await this.resultRepo.findRecent(limit);
    return results.map((r) => ChainDetectionResultMapper.toView(r));
  }
}
