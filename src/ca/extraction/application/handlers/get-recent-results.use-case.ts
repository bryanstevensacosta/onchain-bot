import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ExtractionResultRepository } from 'ca/extraction/application/ports/extraction-result.repository';
import {
  ExtractionResultMapper,
  ExtractionResultView,
} from 'ca/extraction/application/mappers/extraction-result.mapper';

/**
 * Use case: read the most recent N extraction results (most-recent first).
 */
@Injectable()
export class GetRecentResultsUseCase {
  public constructor(private readonly resultRepo: ExtractionResultRepository) {}

  public async execute(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionResultView>> {
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid limit: ${limit}`, {
        limit,
      });
    }
    const results = await this.resultRepo.findRecent(limit);
    return results.map((r) => ExtractionResultMapper.toView(r));
  }
}
