import { Injectable, Logger } from '@nestjs/common';
import { ParsedFields, ParserInput, ParserPort } from '../../domain/ports/parser.port';

/**
 * Heuristic parser adapter (v1).
 *
 * Message-level field extraction via regex + position patterns
 * (same heuristic family as the backend reference adapter):
 *
 * - Ticker: explicit `$XYZ` wins over labeled `ticker|symbol|coin: …`
 * - Name: labeled `name|token name: …` up to the next delimiter
 * - Chart: first URL on a known chart host
 *   (`dexscreener|geckoterminal|dextools|birdeye|poocoin|honeypot.is`)
 *
 * All fields are optional — missing fields yield `null`, never a throw.
 * Deliberately stateless per message: it never sees the candidate list,
 * so it cannot collapse mentions (P5).
 */
@Injectable()
export class HeuristicParserAdapter extends ParserPort {
  private readonly logger = new Logger(HeuristicParserAdapter.name);

  private static readonly TICKER_EXPLICIT = /\$([A-Z]{2,10})\b/;
  private static readonly TICKER_LABELED =
    /\b(?:ticker|symbol|coin)\s*[:=]\s*\$?([A-Z]{2,10})\b/i;

  private static readonly NAME_LABELED =
    /\b(?:name|token\s*name)\s*[:=]\s*([^\n|;]+?)(?=\s*(?:\||\n|;|ca|contract|mc|lp|fdv|holders|tg|chart|$))/i;

  private static readonly CHART_HOSTS =
    /(?:dexscreener|geckoterminal|dextools|birdeye|poocoin|honeypot\.is)/i;
  private static readonly URL_PATTERN = /https?:\/\/[^\s<>")']+/g;

  public async parse(input: ParserInput): Promise<ParsedFields> {
    const text = input.rawText ?? '';
    const fields = {
      ticker: this.extractTicker(text),
      name: this.extractName(text),
      chart: this.extractChart(text),
    };
    if (fields.ticker === null && fields.name === null && fields.chart === null) {
      this.logger.debug('No parsed fields extracted from message');
    }
    return Promise.resolve(fields);
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

  private extractChart(text: string): string | null {
    const urls = text.match(HeuristicParserAdapter.URL_PATTERN) ?? [];
    for (const url of urls) {
      const cleaned = url.replace(/[.,)\]}>'"`]+$/, '');
      if (HeuristicParserAdapter.CHART_HOSTS.test(cleaned)) return cleaned;
    }
    return null;
  }
}
