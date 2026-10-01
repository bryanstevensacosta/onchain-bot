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
import { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';

/**
 * Outbound port: persistence for extraction results.
 *
 * Implemented in infrastructure/repositories.
 */
export abstract class ExtractionResultRepository {
  public abstract save(result: ExtractionResult): Promise<void>;
  public abstract findByChannelAndMessage(
    kolId: string,
    messageId: number,
  ): Promise<ExtractionResult | null>;
  public abstract findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ExtractionResult>>;
}
