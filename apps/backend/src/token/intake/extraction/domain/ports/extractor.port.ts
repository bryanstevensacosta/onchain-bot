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
