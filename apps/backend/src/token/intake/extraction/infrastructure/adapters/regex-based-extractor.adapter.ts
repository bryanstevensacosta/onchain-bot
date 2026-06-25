import { Injectable, Logger } from '@nestjs/common';
import bs58 from 'bs58';
import {
  ExtractorInput,
  ExtractorPort,
  ExtractedCandidates,
} from 'token/intake/extraction/domain/ports/extractor.port';
import { ContractAddress } from 'token/identity/contract-address.vo';
import { Ticker } from 'token/intake/extraction/domain/value-objects/ticker.vo';
import { Url } from 'token/intake/extraction/domain/value-objects/url.vo';

/**
 * Regex + Base58 extractor adapter.
 *
 * Extracts three categories of candidates from raw message text:
 * - EVM contract addresses (`0x` + 40 hex chars)
 * - Solana addresses (Base58 decodable to exactly 32 bytes)
 * - Tickers (uppercase 2-10 chars, optional `$` prefix, with common-word blocklist)
 * - URLs (http/https + `t.me/` deep links)
 *
 * Returns deduplicated, validated value objects. Empty candidates are normal.
 *
 * Per docs/api/misc/ca.md section 2 (Extraction) and
 * docs/api/misc/chain-detection.md (PRO Base58 validation).
 */
@Injectable()
export class RegexBasedExtractorAdapter extends ExtractorPort {
  private readonly logger = new Logger(RegexBasedExtractorAdapter.name);

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
  ): ReadonlyArray<ContractAddress> {
    const out = new Map<string, ContractAddress>();

    for (const match of text.matchAll(RegexBasedExtractorAdapter.EVM_PATTERN)) {
      try {
        const ca = ContractAddress.fromEvm(match[0]);
        out.set(ca.value, ca);
      } catch (err) {
        this.logger.debug(
          `EVM candidate rejected: ${match[0]} (${(err as Error).message})`,
        );
      }
    }

    for (const match of text.matchAll(
      RegexBasedExtractorAdapter.SOLANA_CANDIDATE_PATTERN,
    )) {
      const candidate = match[0];
      try {
        const decoded = bs58.decode(candidate);
        if (decoded.length !== 32) continue;
        const ca = ContractAddress.fromSolana(candidate);
        out.set(ca.value, ca);
      } catch {
        // Not valid Base58 — skip silently
      }
    }

    return Array.from(out.values());
  }

  private extractTickers(text: string): ReadonlyArray<Ticker> {
    const out = new Map<string, Ticker>();
    for (const match of text.matchAll(
      RegexBasedExtractorAdapter.TICKER_PATTERN,
    )) {
      const raw = match[0].replace(/^\$/, '').toUpperCase();
      if (RegexBasedExtractorAdapter.TICKER_BLOCKLIST.has(raw)) continue;
      try {
        const ticker = Ticker.fromString(raw);
        out.set(ticker.value, ticker);
      } catch {
        // Pattern guarantees format; defensive guard.
      }
    }
    return Array.from(out.values());
  }

  private extractUrls(text: string): ReadonlyArray<Url> {
    const out = new Map<string, Url>();
    for (const match of text.matchAll(RegexBasedExtractorAdapter.URL_PATTERN)) {
      const cleaned = match[0].replace(/[.,)\]}>'"`]+$/, '');
      try {
        const url = Url.fromString(cleaned);
        out.set(url.value, url);
      } catch (err) {
        this.logger.debug(
          `URL candidate rejected: ${cleaned} (${(err as Error).message})`,
        );
      }
    }
    return Array.from(out.values());
  }
}
