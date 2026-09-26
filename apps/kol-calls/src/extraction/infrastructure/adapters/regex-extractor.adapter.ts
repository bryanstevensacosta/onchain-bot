import { Injectable, Logger } from '@nestjs/common';
import {
  ExtractorInput,
  ExtractorPort,
  ExtractedCandidates,
} from '../../domain/ports/extractor.port';
import { NormalizedAddress } from '../../../shared/value-objects/normalized-address.vo';
import { Ticker } from '../../domain/value-objects/ticker.vo';
import { Url } from '../../domain/value-objects/url.vo';

/**
 * Regex extractor adapter (patterns mirror the backend
 * `RegexBasedExtractorAdapter`; behavior diverges on P1/P5).
 *
 * - Contract occurrences are returned ONE PER MATCH, in text order — the
 *   backend `Map`-dedupe is deliberately NOT copied: repeats are valid
 *   mentions and multi-tip messages must not collapse.
 * - Tickers/urls are message-level context attached to every candidate of
 *   the message, unique by value in first-appearance order (context
 *   normalization, not mention-layer dedup).
 * - Malformed candidates are skipped with a debug log, never thrown — a
 *   message without contracts yields empty arrays, not an error.
 */
@Injectable()
export class RegexExtractorAdapter extends ExtractorPort {
  private readonly logger = new Logger(RegexExtractorAdapter.name);

  private static readonly EVM_PATTERN =
    /(?<![A-Za-z0-9])0x[a-fA-F0-9]{40}(?![A-Za-z0-9])/g;
  private static readonly SOLANA_CANDIDATE_PATTERN =
    /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
  private static readonly TICKER_PATTERN = /\$?[A-Z]{2,10}\b/g;
  private static readonly URL_PATTERN =
    /https?:\/\/[^\s<>")']+|t\.me\/[A-Za-z0-9_]+/g;

  private static readonly TICKER_BLOCKLIST = new Set<string>([
    'BUY',
    'SELL',
    'NOW',
    'NEW',
    'THE',
    'FOR',
    'AND',
    'WITH',
    'FROM',
    'THIS',
    'THAT',
    'YOU',
    'YOUR',
    'OUR',
    'ALL',
    'OUT',
    'HOLD',
    'HOLDING',
    'TG',
    'DM',
    'CA',
    'CHART',
    'MC',
    'LP',
    'ATH',
    'FDV',
    'TX',
    'AT',
    'IN',
    'ON',
    'IS',
    'IT',
    'OF',
    'TO',
    'BY',
    'BE',
    'AS',
    'OR',
    'GO',
    'UP',
    'DOWN',
    'HIGH',
    'LOW',
    'NEXT',
    'LAST',
    'FIRST',
    'PUMP',
    'DUMP',
    'RUG',
    'SCAM',
    'SAFE',
    'ALPHA',
    'BETA',
    'LIQ',
    'SUPPLY',
    'HOLDER',
    'HOLDERS',
    'TOP',
    'PERCENT',
    'MAX',
    'MIN',
    'JOIN',
    'CHAT',
    'GROUP',
    'CHANNEL',
    'SOON',
    'LIVE',
    'WIN',
    'LOSE',
    'GAIN',
    'A',
    'I',
    'OK',
    'YES',
    'NO',
  ]);

  public async extract(input: ExtractorInput): Promise<ExtractedCandidates> {
    const text = input.text ?? '';
    return Promise.resolve({
      contractAddresses: this.extractContractAddresses(text),
      tickers: this.extractTickers(text),
      urls: this.extractUrls(text),
    });
  }

  private extractContractAddresses(
    text: string,
  ): ReadonlyArray<NormalizedAddress> {
    const out: NormalizedAddress[] = [];

    for (const match of text.matchAll(RegexExtractorAdapter.EVM_PATTERN)) {
      try {
        out.push(NormalizedAddress.fromEvm(match[0]));
      } catch (err) {
        this.logger.debug(
          `EVM candidate rejected: ${match[0]} (${(err as Error).message})`,
        );
      }
    }

    for (const match of text.matchAll(
      RegexExtractorAdapter.SOLANA_CANDIDATE_PATTERN,
    )) {
      const candidate = match[0];
      try {
        out.push(NormalizedAddress.fromSolana(candidate));
      } catch {
        // Not a 32-byte Base58 address — skip silently.
      }
    }

    return out;
  }

  private extractTickers(text: string): ReadonlyArray<Ticker> {
    const seen = new Set<string>();
    const out: Ticker[] = [];
    for (const match of text.matchAll(RegexExtractorAdapter.TICKER_PATTERN)) {
      const raw = match[0].replace(/^\$/, '').toUpperCase();
      if (RegexExtractorAdapter.TICKER_BLOCKLIST.has(raw)) continue;
      if (seen.has(raw)) continue;
      try {
        const ticker = Ticker.fromString(raw);
        seen.add(ticker.value);
        out.push(ticker);
      } catch {
        // Pattern guarantees format; defensive guard.
      }
    }
    return out;
  }

  private extractUrls(text: string): ReadonlyArray<Url> {
    const seen = new Set<string>();
    const out: Url[] = [];
    for (const match of text.matchAll(RegexExtractorAdapter.URL_PATTERN)) {
      const cleaned = match[0].replace(/[.,)\]}>'"`]+$/, '');
      if (seen.has(cleaned)) continue;
      try {
        const url = Url.fromString(cleaned);
        seen.add(url.value);
        out.push(url);
      } catch (err) {
        this.logger.debug(
          `URL candidate rejected: ${cleaned} (${(err as Error).message})`,
        );
      }
    }
    return out;
  }
}
