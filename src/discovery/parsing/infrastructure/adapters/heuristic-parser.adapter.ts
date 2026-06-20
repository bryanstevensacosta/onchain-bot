import { Injectable, Logger } from '@nestjs/common';
import {
  ParserPort,
  ParserInput,
  ParsedCallFields,
} from 'discovery/parsing/domain/ports/parser.port';
import { TokenMetrics } from 'shared/common/value-objects/token-metrics.vo';
import { Usd } from 'discovery/parsing/domain/value-objects/usd.vo';

/**
 * Heuristic parser adapter (v1).
 *
 * Extracts structured fields from raw Telegram alpha-call messages using
 * regex + position patterns. Deterministic, fast (~ms), no external deps.
 *
 * Recognized patterns:
 * - Ticker: explicit `$XYZ` or `TICKER:` followed by uppercase letters
 * - Name: `Name: ...`, `Token: ...`
 * - Market Cap: `MC`, `Market Cap`, `mcap` → `$180K`, `1.2M usd`
 * - Liquidity: `LP`, `Liq`, `Liquidity` → `$45K`
 * - FDV: `FDV` → `$2.5M`
 * - Holders: `Holders`, `H`, `HODLERS` → `1,230` or `1.2k`
 * - Chart: URL that matches `dexscreener`, `geckoterminal`, `dextools`, `birdeye`
 *
 * All fields are optional. Missing fields yield `null` / empty metrics.
 *
 * v2 will add an LLM fallback for messages where confidence < 0.5.
 */
@Injectable()
export class HeuristicParserAdapter extends ParserPort {
  private readonly logger = new Logger(HeuristicParserAdapter.name);

  private static readonly TICKER_EXPLICIT = /\$([A-Z]{2,10})\b/;
  private static readonly TICKER_LABELED =
    /\b(?:ticker|symbol|coin)\s*[:=]\s*\$?([A-Z]{2,10})\b/i;

  private static readonly NAME_LABELED =
    /\b(?:name|token\s*name)\s*[:=]\s*([^\n|;]+?)(?=\s*(?:\||\n|;|ca|contract|mc|lp|fdv|holders|tg|chart|🔗|$))/i;

  private static readonly MC_PATTERN =
    /\b(?:mc|market\s*cap|mcap)\s*[:=]?\s*\$?([\d.,]+)\s*([KkMmBb])?/i;
  private static readonly LP_PATTERN =
    /\b(?:lp|liq|liquidity)\s*[:=]?\s*\$?([\d.,]+)\s*([KkMmBb])?/i;
  private static readonly FDV_PATTERN =
    /\bfdv\s*[:=]?\s*\$?([\d.,]+)\s*([KkMmBb])?/i;
  private static readonly HOLDERS_PATTERN =
    /\b(?:h|holders?|hodlers?)\s*[:=]?\s*([\d.,]+)\s*([KkMm])?/i;

  private static readonly CHART_HOSTS =
    /(?:dexscreener|geckoterminal|dextools|birdeye|poocoin|honeypot\.is)/i;
  private static readonly URL_PATTERN = /https?:\/\/[^\s<>")']+/g;

  public async parse(input: ParserInput): Promise<ParsedCallFields> {
    const text = input.rawText ?? '';
    return Promise.resolve({
      ticker: this.extractTicker(text),
      name: this.extractName(text),
      metrics: this.extractMetrics(text),
      chart: this.extractChart(text),
    });
  }

  private extractTicker(text: string): string | null {
    const explicit = text.match(HeuristicParserAdapter.TICKER_EXPLICIT);
    if (explicit) return explicit[1].toUpperCase();
    const labeled = text.match(HeuristicParserAdapter.TICKER_LABELED);
    if (labeled) return labeled[1].toUpperCase();
    return null;
  }

  private extractName(text: string): string | null {
    const match = text.match(HeuristicParserAdapter.NAME_LABELED);
    if (!match) return null;
    const name = match[1].trim().replace(/\s+/g, ' ');
    return name.length > 0 ? name : null;
  }

  private extractMetrics(text: string): TokenMetrics {
    const mc = this.extractUsd(text, HeuristicParserAdapter.MC_PATTERN);
    const lp = this.extractUsd(text, HeuristicParserAdapter.LP_PATTERN);
    const fdv = this.extractUsd(text, HeuristicParserAdapter.FDV_PATTERN);
    const holders = this.extractHolders(text);

    if (mc === null && lp === null && fdv === null && holders === null) {
      this.logger.debug('No metrics extracted from message');
    }

    return TokenMetrics.create({
      marketCapUsd: mc,
      liquidityUsd: lp,
      fdvUsd: fdv,
      holders,
    });
  }

  private extractUsd(text: string, pattern: RegExp): number | null {
    const match = text.match(pattern);
    if (!match) return null;
    const shorthand = match[1] + (match[2] ?? '');
    const usd = Usd.fromShorthand(shorthand);
    return usd ? usd.amount : null;
  }

  private extractHolders(text: string): number | null {
    const match = text.match(HeuristicParserAdapter.HOLDERS_PATTERN);
    if (!match) return null;
    const shorthand = match[1].replace(/,/g, '') + (match[2] ?? '');
    const usd = Usd.fromShorthand(shorthand);
    return usd ? usd.amount : null;
  }

  private extractChart(text: string): string | null {
    const urls = text.match(HeuristicParserAdapter.URL_PATTERN) ?? [];
    for (const url of urls) {
      const cleaned = url.replace(/[.,)\]}>'"`]+$/, '');
      if (HeuristicParserAdapter.CHART_HOSTS.test(cleaned)) return cleaned;
    }
    return null;
  }
}
