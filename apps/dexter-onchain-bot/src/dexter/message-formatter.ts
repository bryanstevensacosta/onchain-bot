import { Injectable } from '@nestjs/common';
import type { ResolvedToken } from './token-scan.pipeline';

export interface FormattedTokenMessage {
  readonly text: string;
  readonly truncated: boolean;
}

/**
 * Markdown message formatter for Telegram (moved from backend
 * chain-dexter-bot `infrastructure/telegram/message-formatter.adapter.ts`).
 *
 * Legacy Markdown mode; user-controlled strings escaped; output capped
 * at Telegram's 4096-char limit with truncation at a safe boundary.
 */
@Injectable()
export class MessageFormatterAdapter {
  private static readonly MAX_LENGTH = 4096;
  private static readonly TRUNCATION_MARKER = '\n\n… (truncated)';

  public formatTokenScan(
    tokenInfo: ResolvedToken,
    options: { compact?: boolean } = {},
  ): FormattedTokenMessage {
    const compact = options.compact ?? false;
    const raw = compact
      ? this.formatCompact(tokenInfo)
      : this.formatFull(tokenInfo);
    return this.enforceLength(raw);
  }

  public format(tokenInfo: ResolvedToken): string {
    return this.formatTokenScan(tokenInfo, { compact: false }).text;
  }

  public escapeMarkdown(text: string): string {
    if (!text) return '';
    return text.replace(/([_*`[\]])/g, '\\$1');
  }

  public escapeMarkdownV2(text: string): string {
    if (!text) return '';
    return text.replace(/([_*[]()~`>#+-=|{}.!\\])/g, '\\$1');
  }

  public truncate(
    text: string,
    maxLength = MessageFormatterAdapter.MAX_LENGTH,
  ): string {
    if (text.length <= maxLength) return text;
    const budget = maxLength - MessageFormatterAdapter.TRUNCATION_MARKER.length;
    if (budget <= 0)
      return MessageFormatterAdapter.TRUNCATION_MARKER.slice(0, maxLength);

    let cutAt = text.lastIndexOf('\n', budget);
    if (cutAt < budget * 0.6) {
      cutAt = text.lastIndexOf(' ', budget);
    }
    if (cutAt < budget * 0.4) {
      cutAt = budget;
    }
    return (
      text.slice(0, cutAt).trimEnd() + MessageFormatterAdapter.TRUNCATION_MARKER
    );
  }

  private formatFull(tokenInfo: ResolvedToken): string {
    const header = `💊 $${this.escapeMarkdown(tokenInfo.symbol)} | ${this.escapeMarkdown(tokenInfo.name)}`;
    const mc = this.formatMoney(tokenInfo.marketCapUsd);
    const fdv = this.formatMoney(tokenInfo.fdvUsd);
    const price = this.formatMoney(tokenInfo.priceUsd);
    const priceChange = this.formatPercent(tokenInfo.priceChange24h);
    const liq = this.formatMoney(tokenInfo.liquidityUsd);
    const vol = this.formatMoney(tokenInfo.volume24hUsd);
    const holders = this.formatNumber(tokenInfo.holders);
    const top10 = this.formatPercent(tokenInfo.top10HolderPercent);

    return `${header}

📊 Token Info
├ MC:      ${mc}
├ FDV:     ${fdv}
├ USD:     ${price} (${priceChange})
├ LIQ:     ${liq}
├ VOL:     ${vol}
└ HOLDERS: ${holders}
   └ Top 10: ${top10}`;
  }

  private formatCompact(tokenInfo: ResolvedToken): string {
    const header = `💊 $${this.escapeMarkdown(tokenInfo.symbol)} | ${this.escapeMarkdown(tokenInfo.name)}`;
    const price = this.formatMoney(tokenInfo.priceUsd);
    const priceChange = this.formatPercent(tokenInfo.priceChange24h);
    const mc = this.formatMoney(tokenInfo.marketCapUsd);

    return `${header}
💰 ${price} (${priceChange}) • MC ${mc}`;
  }

  private enforceLength(text: string): FormattedTokenMessage {
    const limit = MessageFormatterAdapter.MAX_LENGTH;
    if (text.length <= limit) {
      return { text, truncated: false };
    }
    return { text: this.truncate(text, limit), truncated: true };
  }

  private formatNumber(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  }

  private formatMoney(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    if (value >= 1_000_000_000)
      return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  }

  private formatPercent(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }
}
