/**
 * @deprecated Moved to apps/kol-calls/src/extraction/ (Tramo 1, todo 5 + P18 companion).
 * Extraction per-mention now lives in kol-calls: ExtractFromMessageUseCase (direct call,
 * fix-1, no event bus; multi-tip NO collapse, one row per mention) + snapshot base emit.
 * This file stays wired for dual-run; it will be removed in todo 16 (cutover + cleanup).
 * Do not extend it — add extraction logic in apps/kol-calls/src/extraction/ instead.
 *
 * New location: apps/kol-calls/src/extraction/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ExtractionResultRepository } from 'token/intake/extraction/application/ports/extraction-result.repository';
import {
  ExtractionResultMapper,
  ExtractionResultView,
} from 'token/intake/extraction/application/mappers/extraction-result.mapper';

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
