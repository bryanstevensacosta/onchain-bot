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
