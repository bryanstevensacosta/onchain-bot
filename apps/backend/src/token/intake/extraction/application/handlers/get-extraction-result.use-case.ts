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
 * Use case: read a single extraction result by channel + message id.
 */
@Injectable()
export class GetExtractionResultUseCase {
  public constructor(private readonly resultRepo: ExtractionResultRepository) {}

  public async execute(
    kolId: string,
    messageId: number,
  ): Promise<ExtractionResultView> {
    const result = await this.resultRepo.findByChannelAndMessage(
      kolId,
      messageId,
    );
    if (!result) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Extraction result not found: ${kolId}:${messageId}`,
        { kolId, messageId },
      );
    }
    return ExtractionResultMapper.toView(result);
  }
}
