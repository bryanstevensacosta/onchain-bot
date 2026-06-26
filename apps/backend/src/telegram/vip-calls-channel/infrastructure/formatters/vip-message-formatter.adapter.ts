import { Injectable } from '@nestjs/common';
import {
  MessageFormatterPort,
  ApprovedCallInput,
  TelegramInlineKeyboard,
} from 'telegram/shared';

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

@Injectable()
export class VipCallsMessageFormatterAdapter extends MessageFormatterPort {
  public format(input: ApprovedCallInput): string {
    const chainLower = input.chain.toLowerCase();
    const addressLower = input.address.toLowerCase();
    const isPumpFun = chainLower === 'solana' && addressLower.endsWith('pump');

    const chainEmoji = isPumpFun
      ? '💊'
      : (CHAIN_EMOJI[chainLower] ?? DEFAULT_CHAIN_EMOJI);
    const chainLabel = isPumpFun
      ? '$SOL PUMPFUN'
      : `$${input.chain.toUpperCase()}`;
    const symbol = input.ticker ? `**${input.ticker}**` : '**UNKNOWN**';

    const parts: string[] = [];
    parts.push(`${chainEmoji} ${chainLabel} | ${symbol}`);
    parts.push('');

    if (input.marketCapUsd !== null) {
      parts.push(`MC: \`${this.formatUsd(input.marketCapUsd)}\``);
      parts.push('');
    }

    parts.push(`\`${input.address}\``);

    if (input.chart) {
      parts.push('');
      parts.push(`🦅 [Dexscreener](${input.chart})`);
    }

    return parts.join('\n');
  }

  public formatKeyboard(input: ApprovedCallInput): TelegramInlineKeyboard {
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

  private formatUsd(amount: number): string {
    if (amount >= 1_000_000_000)
      return `$${(amount / 1_000_000_000).toFixed(2)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
    return `$${amount.toFixed(2)}`;
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
}
