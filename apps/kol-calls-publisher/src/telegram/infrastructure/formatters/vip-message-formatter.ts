import { Injectable } from '@nestjs/common';

export interface PublishCardInput {
  readonly chain: string;
  readonly address: string;
  /** Non-null by the publisher boundary; UNKNOWN is a defensive fallback only. */
  readonly ticker: string;
  readonly marketCapUsd?: number | null;
  readonly chart?: string | null;
}

const CHAIN_EMOJI: Record<string, string> = {
  solana: '🟣',
  base: '🔵',
  tron: '🔴',
  bsc: '🟡',
  ethereum: '🔷',
  bitcoin: '₿',
  sui: '🔵🌊',
  avalanche: '🟠',
};

const DEFAULT_CHAIN_EMOJI = '🪙';

/**
 * VIP publish card formatter (first C-SHARED-01 move, Tramo 1 todo 11).
 *
 * MOVED from `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/formatters/vip-message-formatter.adapter.ts`
 * (read-only reference — backend untouched in this todo): same card shape
 * (`{emoji} $CHAIN | $TICKER` + MC + address + Dexscreener link), same
 * trade-button keyboard, same milestone format. The ticker-null branch is
 * kept as defense-in-depth — the use-cases reject null tickers before this
 * is ever called.
 */
@Injectable()
export class VipMessageFormatter {
  public format(input: PublishCardInput): string {
    const chainLower = input.chain.toLowerCase();
    const chainEmoji = CHAIN_EMOJI[chainLower] ?? DEFAULT_CHAIN_EMOJI;
    const chainLabel = `$${input.chain.toUpperCase()}`;
    const symbol = input.ticker?.trim() ? `$${input.ticker.trim()}` : 'UNKNOWN';

    const parts: string[] = [];
    parts.push(`${chainEmoji} ${chainLabel} | ${symbol}`);
    parts.push('');

    if (input.marketCapUsd !== null && input.marketCapUsd !== undefined) {
      parts.push(`**MC**: \`${this.formatUsd(input.marketCapUsd)}\``);
      parts.push('');
    }

    parts.push(`\`${input.address}\``);

    if (input.chart) {
      parts.push('');
      parts.push(`🦅 [Dexscreener](${input.chart})`);
    }

    return parts.join('\n');
  }

  public formatKeyboard(input: {
    chain: string;
    address: string;
  }): Array<Array<{ text: string; url: string }>> {
    const chain = input.chain.toLowerCase();
    const address = input.address;
    return [
      [
        { text: '🔺 Axiom', url: `https://axiom.trade/t/${chain}/${address}` },
        {
          text: '☀️ Photon',
          url: `https://photon-sol.tinyastro.io/@${address}`,
        },
        {
          text: '🔍 GMGN',
          url: `https://gmgn.ai/?ref=ref&chain=${chain}&token=${address}`,
        },
      ],
      [
        { text: '💊 Padre', url: `https://padre.gg/t/${address}` },
        { text: '🤖 Maestro', url: `https://t.me/MaestroBot?start=${address}` },
        {
          text: '🍌 Banana',
          url: `https://t.me/BananaGun_bot?start=${address}`,
        },
      ],
      [
        {
          text: '🏛️ Trojan',
          url: `https://t.me/TrojanBot?start=ref_${address}`,
        },
        { text: '🟦 Based', url: `https://t.me/BasedBot?start=${address}` },
        {
          text: '✳️ Sigma',
          url: `https://t.me/SigmaTradingBot?start=${address}`,
        },
      ],
    ];
  }

  public formatMilestoneMessage(input: {
    chain: string;
    address: string;
    multiple: number;
    mcAtCall: number;
    mcNow: number;
  }): string {
    const chainEmoji =
      CHAIN_EMOJI[input.chain.toLowerCase()] ?? DEFAULT_CHAIN_EMOJI;
    const multipleLabel =
      input.multiple % 1 === 0
        ? `${input.multiple.toFixed(0)}x`
        : `${input.multiple}x`;
    return [
      `🚀 MILESTONE ${multipleLabel} ${chainEmoji} $${input.chain.toUpperCase()}`,
      '',
      `MC: \`${this.formatUsd(input.mcAtCall)}\` → \`${this.formatUsd(input.mcNow)}\``,
      `\`${input.address}\``,
    ].join('\n');
  }

  private formatUsd(amount: number): string {
    if (amount >= 1_000_000_000)
      return `$${(amount / 1_000_000_000).toFixed(2)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
    return `$${amount.toFixed(2)}`;
  }
}
