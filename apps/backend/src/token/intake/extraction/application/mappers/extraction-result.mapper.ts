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
import type { ExtractionResult } from 'token/intake/extraction/domain/entities/extraction-result.entity';

/**
 * Outbound view model: extraction result summary for API consumers.
 */
export interface ExtractionResultView {
  readonly id: string;
  readonly kolId: string;
  readonly messageId: number;
  readonly occurredAt: string;
  readonly contractAddresses: ReadonlyArray<{
    readonly value: string;
    readonly chainHint: string;
  }>;
  readonly tickers: ReadonlyArray<string>;
  readonly urls: ReadonlyArray<{
    readonly value: string;
    readonly scheme: string;
  }>;
}

/**
 * Maps ExtractionResult aggregates to outbound view models.
 */
export class ExtractionResultMapper {
  public static toView(result: ExtractionResult): ExtractionResultView {
    return {
      id: result.id,
      kolId: result.kolId,
      messageId: result.messageId,
      occurredAt: result.occurredAt.toISOString(),
      contractAddresses: result.contractAddresses.map((c) => ({
        value: c.value,
        chainHint: c.chainHint.value,
      })),
      tickers: result.tickers.map((t) => t.value),
      urls: result.urls.map((u) => ({
        value: u.value,
        scheme: u.scheme,
      })),
    };
  }
}
