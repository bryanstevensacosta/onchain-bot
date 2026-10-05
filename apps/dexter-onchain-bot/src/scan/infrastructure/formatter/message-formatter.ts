import { Injectable } from '@nestjs/common';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';

export interface FormattedTokenMessage {
  readonly text: string;
  readonly truncated: boolean;
}

export interface ScanCardMessage {
  readonly text: string;
  readonly truncated: boolean;
  readonly parseMode: 'MarkdownV2';
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
  public static readonly MAX_LENGTH = 4096;
  public static readonly TRUNCATION_MARKER = '\n\n… (truncated)';

  /**
   * Public static surface reused by `placeholders/` TemplateRenderer
   * (todo 4, dexter-message-templates). Pure delegation over the
   * private helpers below — zero behavior change for existing cards.
   */
  public static escapeV2Text(text: string): string {
    return MessageFormatterAdapter.escapeV2(text);
  }

  public static truncateText(
    text: string,
    maxLength = MessageFormatterAdapter.MAX_LENGTH,
  ): string {
    if (text.length <= maxLength) return text;
    const marker = MessageFormatterAdapter.TRUNCATION_MARKER;
    const budget = maxLength - marker.length;
    if (budget <= 0) return marker.slice(0, maxLength);

    let cutAt = text.lastIndexOf('\n', budget);
    if (cutAt < budget * 0.6) {
      cutAt = text.lastIndexOf(' ', budget);
    }
    if (cutAt < budget * 0.4) {
      cutAt = budget;
    }
    return text.slice(0, cutAt).trimEnd() + marker;
  }

  public static enforceLengthText(text: string): FormattedTokenMessage {
    const limit = MessageFormatterAdapter.MAX_LENGTH;
    if (text.length <= limit) {
      return { text, truncated: false };
    }
    return {
      text: MessageFormatterAdapter.truncateText(text, limit),
      truncated: true,
    };
  }

  /**
   * Rick-parity number policy (plan todo 13, evidence
   * `docs/examples-for-dexter/*` + https://docs.rick.bot/features/pricebot
   * "Reading a token scan": `[2.3M/12%]`, `FDV: 2.3M`, `Liq: 234K`,
   * `USD: 0.002345`, `Ether [3,457/-2.5%]`).
   *
   * One rule per metric, presentation layer only:
   * - money (mc/fdv/liq/vol/ath) → compact K/M/B, NO `$` prefix
   *   (`23.3K`, `7.9K`, `1.46B`, `752`); `$` lives in template bodies
   *   as literal static text where a style wants it (Proficy-style).
   * - price (`priceUsd` only) → adaptive: `<1` full significant
   *   digits plain (`0.00002434`, never `$0.00`); `>=1` grouped
   *   max-2 (`3,457`, `164.32`). Routed by the renderer, NOT via
   *   `formatMoneyText` (other money fields keep the compact rule).
   * - percent → 1-decimal-trimmed, sign ONLY when negative
   *   (`80%`, `-34.4%`, never `+`; `-0` normalizes to `0%`).
   * - counts → `formatNumberText`, unchanged.
   * - `N/A` on null, unchanged.
   *
   * Shared helper: `trimFixed` = `toFixed(n)` with trailing zeros
   * (and a dangling dot) stripped; `-0` normalizes to `0`.
   * Money keeps up to 2 decimals so evidence values render verbatim
   * (`30.22K`, `1.46B`) while 1-decimal evidence is untouched
   * (`23.3K`, `7.9K`); percent is strictly 1-decimal per the ticket.
   */
  private static trimFixed(value: number, maxDecimals: number): string {
    let text = value.toFixed(maxDecimals);
    if (text.includes('.')) {
      text = text.replace(/0+$/, '').replace(/\.$/, '');
    }
    if (text === '-0') return '0';
    return text;
  }

  public static formatMoneyText(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000)
      return `${sign}${MessageFormatterAdapter.trimFixed(abs / 1_000_000_000, 2)}B`;
    if (abs >= 1_000_000)
      return `${sign}${MessageFormatterAdapter.trimFixed(abs / 1_000_000, 2)}M`;
    if (abs >= 1_000)
      return `${sign}${MessageFormatterAdapter.trimFixed(abs / 1_000, 2)}K`;
    return `${sign}${MessageFormatterAdapter.trimFixed(abs, 2)}`;
  }

  /**
   * Adaptive price rule for `priceUsd` (fixes the live `$0.00`-for-dust
   * bug: dust used to flow through `formatMoneyText`). `<1` renders
   * the shortest round-trip digits plain (exponent form expanded,
   * never scientific); `>=1` renders grouped with max 2 decimals.
   */
  public static formatPriceText(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    if (value === 0) return '0';
    const abs = Math.abs(value);
    if (abs < 1) {
      const raw = String(abs);
      const plain = raw.includes('e')
        ? MessageFormatterAdapter.expandExponential(raw)
        : raw;
      return `${value < 0 ? '-' : ''}${plain}`;
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  private static expandExponential(raw: string): string {
    const [coeff, expPart] = raw.toLowerCase().split('e');
    const exponent = parseInt(expPart, 10);
    const [intPart, fracPart = ''] = coeff.split('.');
    const digits = `${intPart}${fracPart}`;
    const point = intPart.length + exponent;
    if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
    if (point >= digits.length)
      return `${digits}${'0'.repeat(point - digits.length)}`;
    return `${digits.slice(0, point)}.${digits.slice(point)}`;
  }

  public static formatNumberText(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  }

  public static formatPercentText(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    const magnitude = MessageFormatterAdapter.trimFixed(Math.abs(value), 1);
    if (magnitude === '0') return '0%';
    return `${value < 0 ? '-' : ''}${magnitude}%`;
  }

  /**
   * Compact age for `fdvAthAgo` (dexter fdv-ath, plan todo 16;
   * extended to w/mo/y by plan todo 17):
   * `9d`/`3d`/`5h`/`12m` from an ISO timestamp vs `nowMs`, floored.
   * Thresholds (documented, floored at every unit): <7d → `Xd`,
   * <30d → `Xw` (7d weeks), <365d → `Xmo` (30d months), else `Xy`
   * (365d years). Sub-minute → `0m`. Future timestamps clamp to now
   * (`0m`, never negative). Null or unparseable input → `""`
   * (cold-start honesty — the caller, not the formatter, owns the
   * empty-vs-N/A decision, and no seed ships an age formatter to
   * reuse: grep finds only a comment mention, so this is the single
   * home). The d/h/m rungs are byte-identical to the todo-16
   * behavior (existing specs pin them unchanged).
   */
  public static formatCompactAgeText(
    iso: string | null | undefined,
    nowMs: number = Date.now(),
  ): string {
    if (typeof iso !== 'string' || iso === '') return '';
    const at = Date.parse(iso);
    if (Number.isNaN(at)) return '';
    const diffMs = Math.max(0, nowMs - at);
    const minutes = Math.floor(diffMs / 60_000);
    const days = Math.floor(minutes / (24 * 60));
    if (days >= 365) return `${Math.floor(days / 365)}y`;
    if (days >= 30) return `${Math.floor(days / 30)}mo`;
    if (days >= 7) return `${Math.floor(days / 7)}w`;
    if (minutes >= 24 * 60) return `${days}d`;
    if (minutes >= 60) return `${Math.floor(minutes / 60)}h`;
    return `${minutes}m`;
  }

  public static formatDevLine(tokenInfo: ResolvedToken): string {
    const esc = MessageFormatterAdapter.escapeV2;
    const pct = tokenInfo.devPctSupply;
    const wallets = tokenInfo.devWallets ?? [];
    if (pct === null && wallets.length === 0) return 'Dev N/A';
    const pctLabel = pct === null ? 'N/A' : `${pct.toFixed(2)}%`;
    const top = wallets.slice(0, 2).map((w) => {
      const short =
        w.wallet.length > 10
          ? `${w.wallet.slice(0, 4)}…${w.wallet.slice(-4)}`
          : w.wallet;
      return short;
    });
    const walletsLabel =
      top.length > 0 ? ` \\(${top.map(esc).join(', ')}\\)` : '';
    return `Dev ${esc(pctLabel)}${walletsLabel}`;
  }

  public static buildScanUrl(
    venue: 'dexscreener' | 'geckoterminal',
    chain: string,
    address: string,
  ): string {
    if (venue === 'dexscreener') {
      return `https://dexscreener.com/${chain}/${address}`;
    }
    return `https://www.geckoterminal.com/${chain}/pools/${address}`;
  }

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

  /**
   * Dexter own scan-card template (MarkdownV2 for Bot API sends).
   *
   * Built from `docs/examples-for-dexter/rick-bot-scanner.md` (card
   * anatomy: header + stats + holders/dev + links + trade rows +
   * contract) and the `format-comparison.md` decision (parse from
   * entities JSON, store raw+entities, render MarkdownV2 for bot
   * messages). Own layout — not a copy of any observed bot card:
   *
   * - header: `🔍 $SYMBOL | name — chain` + contract code line
   * - price/MC/liq row, supplies row (FDV + total/circulating/max),
   *   holders/dev row, links row (DexScreener + GeckoTerminal),
   *   trade-buttons hint (buttons travel as the inline keyboard;
   *   the links row keeps the card actionable when the keyboard
   *   shape stays direct-only).
   *
   * All user-controlled strings are MarkdownV2-escaped; the contract
   * hex rides in a code span (no reserved chars). Output capped at
   * 4096 chars like the legacy cards.
   */
  public formatScanCard(tokenInfo: ResolvedToken): ScanCardMessage {
    const esc = MessageFormatterAdapter.escapeV2;
    const symbol = esc(tokenInfo.symbol);
    const name = esc(tokenInfo.name);
    const chain = esc(tokenInfo.chain);
    const header = `🔍 *$${symbol}* \\| ${name} — ${chain}`;
    const contract = `\`${tokenInfo.address}\``;
    const priceLine =
      `💰 ${this.formatPriceV2(tokenInfo.priceUsd)} ` +
      `\\(${this.formatPercentV2(tokenInfo.priceChange24h)}\\) ` +
      `• MC ${this.formatMoneyV2(tokenInfo.marketCapUsd)} ` +
      `• Liq ${this.formatMoneyV2(tokenInfo.liquidityUsd)}`;
    const supplyLine =
      `📦 FDV ${this.formatMoneyV2(tokenInfo.fdvUsd)} ` +
      `• Total supply ${this.formatNumberV2(tokenInfo.totalSupply)} ` +
      `• Circulating ${this.formatNumberV2(tokenInfo.circulatingSupply)} ` +
      `• Max supply ${this.formatNumberV2(tokenInfo.maxSupply)}`;
    const holdersLine =
      `👥 Holders ${this.formatNumberV2(tokenInfo.holders)} ` +
      `• Top 10 ${this.formatPercentV2(tokenInfo.top10HolderPercent)} ` +
      `• ${this.formatDevV2(tokenInfo)}`;
    const linksLine =
      `🔗 [DexScreener](${this.scanUrl('dexscreener', tokenInfo)}) ` +
      `\\| [GeckoTerminal](${this.scanUrl('geckoterminal', tokenInfo)})`;
    const tradeLine = `🤖 Trade via buttons below ⤵`;
    const raw = [
      header,
      contract,
      '',
      priceLine,
      supplyLine,
      holdersLine,
      '',
      linksLine,
      tradeLine,
    ].join('\n');
    const capped = this.enforceLength(raw);
    return { ...capped, parseMode: 'MarkdownV2' };
  }

  private static escapeV2(text: string): string {
    if (!text) return '';
    return text.replace(/([_*[\]()~`>#+=|{}.!\\-])/g, '\\$1');
  }

  private scanUrl(
    venue: 'dexscreener' | 'geckoterminal',
    tokenInfo: ResolvedToken,
  ): string {
    return MessageFormatterAdapter.buildScanUrl(
      venue,
      tokenInfo.chain,
      tokenInfo.address,
    );
  }

  private formatMoneyV2(value: number | null): string {
    return MessageFormatterAdapter.escapeV2(this.formatMoney(value));
  }

  private formatPriceV2(value: number | null): string {
    return MessageFormatterAdapter.escapeV2(
      MessageFormatterAdapter.formatPriceText(value),
    );
  }

  private formatNumberV2(value: number | null): string {
    return MessageFormatterAdapter.escapeV2(this.formatNumber(value));
  }

  private formatPercentV2(value: number | null): string {
    return MessageFormatterAdapter.escapeV2(this.formatPercent(value));
  }

  private formatDevV2(tokenInfo: ResolvedToken): string {
    return MessageFormatterAdapter.formatDevLine(tokenInfo);
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
    return MessageFormatterAdapter.truncateText(text, maxLength);
  }

  private formatFull(tokenInfo: ResolvedToken): string {
    const header = `💊 $${this.escapeMarkdown(tokenInfo.symbol)} | ${this.escapeMarkdown(tokenInfo.name)}`;
    const mc = this.formatMoney(tokenInfo.marketCapUsd);
    const fdv = this.formatMoney(tokenInfo.fdvUsd);
    const price = this.formatPrice(tokenInfo.priceUsd);
    const priceChange = this.formatPercent(tokenInfo.priceChange24h);
    const liq = this.formatMoney(tokenInfo.liquidityUsd);
    const vol = this.formatMoney(tokenInfo.volume24hUsd);
    const holders = this.formatNumber(tokenInfo.holders);
    const top10 = this.formatPercent(tokenInfo.top10HolderPercent);
    const totalSupply = this.formatNumber(tokenInfo.totalSupply);
    const circulating = this.formatNumber(tokenInfo.circulatingSupply);
    const maxSupply = this.formatNumber(tokenInfo.maxSupply);
    const devSection = this.formatDevSection(tokenInfo);

    return `${header}

📊 Token Info
├ MC:      ${mc}
├ FDV:     ${fdv}
├ USD:     ${price} (${priceChange})
├ LIQ:     ${liq}
├ VOL:     ${vol}
├ HOLDERS: ${holders}
│  └ Top 10: ${top10}
├ Total supply: ${totalSupply}
├ Circulating:  ${circulating}
├ Max supply:   ${maxSupply}
${devSection}`;
  }

  private formatCompact(tokenInfo: ResolvedToken): string {
    const header = `💊 $${this.escapeMarkdown(tokenInfo.symbol)} | ${this.escapeMarkdown(tokenInfo.name)}`;
    const price = this.formatPrice(tokenInfo.priceUsd);
    const priceChange = this.formatPercent(tokenInfo.priceChange24h);
    const mc = this.formatMoney(tokenInfo.marketCapUsd);

    return `${header}
💰 ${price} (${priceChange}) • MC ${mc}`;
  }

  private enforceLength(text: string): FormattedTokenMessage {
    return MessageFormatterAdapter.enforceLengthText(text);
  }

  private formatNumber(value: number | null): string {
    return MessageFormatterAdapter.formatNumberText(value);
  }

  private formatMoney(value: number | null): string {
    return MessageFormatterAdapter.formatMoneyText(value);
  }

  private formatPrice(value: number | null): string {
    return MessageFormatterAdapter.formatPriceText(value);
  }

  private formatPercent(value: number | null): string {
    return MessageFormatterAdapter.formatPercentText(value);
  }

  private formatDevSection(tokenInfo: ResolvedToken): string {
    const pct = tokenInfo.devPctSupply;
    const wallets = tokenInfo.devWallets;
    if (pct === null && (wallets === null || wallets.length === 0)) {
      return '└ Dev: N/A (no key or no data)';
    }
    const pctLabel = pct === null ? 'N/A' : `${pct.toFixed(2)}%`;
    const top = (wallets ?? []).slice(0, 3).map((w) => {
      const short =
        w.wallet.length > 10
          ? `${w.wallet.slice(0, 4)}…${w.wallet.slice(-4)}`
          : w.wallet;
      const share =
        w.percentOfSupply === null ? 'N/A' : `${w.percentOfSupply.toFixed(2)}%`;
      const flag = w.probable ? ' (probable)' : '';
      return `${short} ${share}${flag}`;
    });
    const walletsLabel = top.length > 0 ? ` [${top.join(' | ')}]` : '';
    return `└ Dev: ${pctLabel} supply${walletsLabel}`;
  }
}
