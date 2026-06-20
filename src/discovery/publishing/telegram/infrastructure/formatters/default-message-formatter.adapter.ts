import { Injectable } from '@nestjs/common';
import {
  MessageFormatterPort,
  ApprovedCallInput,
} from 'discovery/publishing/telegram/domain/ports/message-formatter.port';

const TIER_EMOJI: Record<string, string> = {
  STRONG: '🔥🔥🔥',
  DECENT: '🔥🔥',
  NEUTRAL: '🔥',
  RISKY: '⚠️',
  AVOID: '🚫',
};

const CHAIN_EMOJI: Record<string, string> = {
  ethereum: '⟠',
  solana: '◎',
  bsc: '🟡',
  base: '🔵',
  arbitrum: '🔷',
  polygon: '🟣',
};

/**
 * Default Telegram message formatter.
 *
 * Template:
 * ```
 * 🔥 ALPHA: $WIF
 *
 * Chain: ⟠ Ethereum
 * Name: dogwifhat
 * MC: $180K
 * LP: $45K
 * Holders: 1,230
 *
 * Contract: 0xabc...
 * Chart: https://dexscreener.com/...
 *
 * Sources: 3 channels · 6 mentions
 * Score: 87/100 🔥🔥🔥
 * Classification: TOKEN
 * ```
 *
 * Emojis are tier-coded (STRONG gets 3 fire emojis, RISKY gets warning).
 */
@Injectable()
export class DefaultMessageFormatterAdapter extends MessageFormatterPort {
  public format(input: ApprovedCallInput): string {
    const lines: string[] = [];
    const tierEmoji = TIER_EMOJI[this.scoreToTier(input.score)] ?? '🔥';
    const chainEmoji = CHAIN_EMOJI[input.chain] ?? '🪙';

    const headline = input.ticker
      ? `${tierEmoji} ALPHA: $${input.ticker.toUpperCase()}`
      : `${tierEmoji} ALPHA DETECTED`;

    lines.push(headline, '');
    lines.push(
      `Chain: ${chainEmoji} ${input.chain.charAt(0).toUpperCase()}${input.chain.slice(1)}`,
    );

    if (input.name) {
      lines.push(`Name: ${input.name}`);
    }
    if (input.marketCapUsd !== null) {
      lines.push(`MC: ${this.formatUsd(input.marketCapUsd)}`);
    }
    if (input.liquidityUsd !== null) {
      lines.push(`LP: ${this.formatUsd(input.liquidityUsd)}`);
    }
    if (input.holders !== null) {
      lines.push(`Holders: ${input.holders.toLocaleString()}`);
    }

    lines.push('');
    lines.push(`Contract: ${input.address}`);
    if (input.chart) {
      lines.push(`Chart: ${input.chart}`);
    }

    lines.push('');
    lines.push(
      `Sources: ${input.sourceCount} channel${input.sourceCount === 1 ? '' : 's'} · ${input.mentionCount} mention${input.mentionCount === 1 ? '' : 's'}`,
    );
    lines.push(`Score: ${input.score}/100 ${tierEmoji}`);
    lines.push(`Classification: ${input.classification}`);

    return lines.join('\n');
  }

  private formatUsd(amount: number): string {
    if (amount >= 1_000_000_000)
      return `$${(amount / 1_000_000_000).toFixed(2)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(2)}K`;
    return `$${amount.toFixed(2)}`;
  }

  private scoreToTier(score: number): string {
    if (score >= 80) return 'STRONG';
    if (score >= 60) return 'DECENT';
    if (score >= 40) return 'NEUTRAL';
    if (score >= 20) return 'RISKY';
    return 'AVOID';
  }
}
