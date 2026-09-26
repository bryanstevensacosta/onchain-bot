import { NormalizedAddress } from '../../../shared/value-objects/normalized-address.vo';
import { Ticker } from '../value-objects/ticker.vo';
import { Url } from '../value-objects/url.vo';

export interface ExtractorInput {
  readonly kolId: string;
  readonly messageId: number;
  readonly occurredAt: Date;
  readonly text: string;
}

/**
 * Raw extraction output: one contract occurrence per array entry.
 *
 * P1/P5: occurrences are NOT deduplicated — the same address twice in one
 * message yields two entries (repeats are first-class mentions). The
 * backend reference adapter collapses matches through a `Map`; that
 * Map-dedupe is deliberately NOT copied here.
 */
export interface ExtractedCandidates {
  readonly contractAddresses: ReadonlyArray<NormalizedAddress>;
  readonly tickers: ReadonlyArray<Ticker>;
  readonly urls: ReadonlyArray<Url>;
}

export abstract class ExtractorPort {
  abstract extract(input: ExtractorInput): Promise<ExtractedCandidates>;
}
