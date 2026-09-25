export interface ParsedFields {
  readonly ticker: string | null;
  readonly name: string | null;
  readonly chart: string | null;
}

export interface ParserInput {
  readonly rawText: string;
}

/**
 * Outbound port: parses message-level structured fields (ticker, name,
 * chart) from raw message text. Implemented by adapters (heuristic v1).
 *
 * The parser does NOT decide which contract is primary — there is no
 * primary: every extraction candidate keeps its own address (P5 1:1,
 * override of the backend `ParsedContract.fromAddresses` collapse).
 */
export abstract class ParserPort {
  abstract parse(input: ParserInput): Promise<ParsedFields>;
}
