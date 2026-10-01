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
import { ContractAddress } from 'token/identity/contract-address.vo';
import { Ticker } from 'token/intake/extraction/domain/value-objects/ticker.vo';
import { Url } from 'token/intake/extraction/domain/value-objects/url.vo';

export interface ExtractedCandidates {
  readonly contractAddresses: ReadonlyArray<ContractAddress>;
  readonly tickers: ReadonlyArray<Ticker>;
  readonly urls: ReadonlyArray<Url>;
}

export interface ExtractorInput {
  readonly kolId: string;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly text: string;
}

/**
 * Outbound port: pulls candidate CAs, tickers, and URLs from raw message text.
 *
 * Implemented by infrastructure adapters (regex-based, ML-based, LLM-based).
 * Returns deduplicated, validated VOs ready for downstream BCs.
 */
export abstract class ExtractorPort {
  public abstract extract(input: ExtractorInput): Promise<ExtractedCandidates>;
}
