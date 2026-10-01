/**
 * @deprecated Moved to apps/kol-calls/src/parsing/ (Tramo 1, todo 6 + P18 companion).
 * Parsing 1:1 now lives in kol-calls: ParseFromCandidatesUseCase → ParsedCall
 * (preserves mentions, NO collapse-to-one). This file stays wired for dual-run;
 * it will be removed in todo 16 (cutover + cleanup). Do not extend it — add parsing
 * logic in apps/kol-calls/src/parsing/ instead.
 *
 * New location: apps/kol-calls/src/parsing/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { TokenMetrics } from 'shared/common/value-objects/token-metrics.vo';

export interface ParsedCallFields {
  readonly ticker: string | null;
  readonly name: string | null;
  readonly metrics: TokenMetrics;
  readonly chart: string | null;
}

export interface ParserInput {
  readonly rawText: string;
}

/**
 * Outbound port: parses structured fields (ticker, name, metrics, chart)
 * from raw message text. Implemented by adapters (heuristic, LLM, hybrid).
 *
 * The parser does NOT decide which CA is the primary contract — that's
 * the TokenCall aggregate's job (it picks the first one).
 */
export abstract class ParserPort {
  public abstract parse(input: ParserInput): Promise<ParsedCallFields>;
}
