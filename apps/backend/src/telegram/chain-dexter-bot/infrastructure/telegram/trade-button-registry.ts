import { Injectable } from '@nestjs/common';
import { ChainDexterBotConfigService } from '../../bot.config';

/**
 * Trade button codes supported by the bot.
 * Extend cautiously — registry is static and platform-specific URLs are hardcoded.
 */
export type TradeButtonCode =
  | 'DEX'
  | 'PHO'
  | 'TRO'
  | 'TRT'
  | 'JUP'
  | 'MAE'
  | 'BAN'
  | 'BM';

export type ChainId =
  | 'solana'
  | 'ethereum'
  | 'base'
  | 'bsc'
  | 'ton'
  | 'fantom'
  | 'avalanche'
  | 'arbitrum'
  | 'polygon'
  | 'unknown';

export interface TradeButton {
  readonly code: TradeButtonCode;
  readonly label: string;
  readonly kind: 'trade' | 'analysis';
  readonly chains: ReadonlySet<ChainId>;
  readonly buildUrl: (address: string, chain: ChainId) => string;
}

/**
 * Hardcoded registry of 8 trade buttons (3 trading + 5 analysis) for MVP.
 * Adding more buttons is a future iteration (the original Rick-bot has 20+).
 *
 * NOTE: URLs are chain-dexter-branded. Affiliate tags use "chaindexter" as a placeholder
 * — replace with real affiliate tag via env var when available.
 */
@Injectable()
export class TradeButtonRegistry {
  private readonly buttons: ReadonlyMap<TradeButtonCode, TradeButton>;

  public constructor(private readonly botConfig: ChainDexterBotConfigService) {
    this.buttons = this.buildRegistry();
  }

  public getButtonsForChain(
    chain: ChainId,
    enabledCodes: ReadonlyArray<TradeButtonCode>,
  ): TradeButton[] {
    const out: TradeButton[] = [];
    for (const code of enabledCodes) {
      const btn = this.buttons.get(code);
      if (!btn) continue;
      if (btn.chains.has(chain) || btn.chains.has('unknown')) {
        out.push(btn);
      }
    }
    return out;
  }

  public resolveUrl(
    code: TradeButtonCode,
    chain: ChainId,
    address: string,
  ): string | null {
    const btn = this.buttons.get(code);
    if (!btn) return null;
    return btn.buildUrl(address, chain);
  }

  public getDefaultCodes(): ReadonlyArray<TradeButtonCode> {
    const defaults = this.botConfig.get().defaultTradeButtons;
    return defaults.filter((c): c is TradeButtonCode => this.isKnownCode(c));
  }

  public getAllCodes(): ReadonlyArray<TradeButtonCode> {
    return Array.from(this.buttons.keys());
  }

  public isKnownCode(code: string): code is TradeButtonCode {
    return this.buttons.has(code as TradeButtonCode);
  }

  private buildRegistry(): ReadonlyMap<TradeButtonCode, TradeButton> {
    const map = new Map<TradeButtonCode, TradeButton>();

    map.set('DEX', {
      code: 'DEX',
      label: 'DexScreener',
      kind: 'analysis',
      chains: new Set<ChainId>([
        'solana',
        'ethereum',
        'base',
        'bsc',
        'ton',
        'fantom',
        'avalanche',
        'arbitrum',
        'polygon',
      ]),
      buildUrl: (address, chain) =>
        `https://dexscreener.com/${chain}/${address}`,
    });

    map.set('PHO', {
      code: 'PHO',
      label: 'Photon',
      kind: 'trade',
      chains: new Set<ChainId>(['solana']),
      buildUrl: (address) =>
        `https://photon-sol.tinyastro.io/@chaindexter?token=${address}`,
    });

    map.set('TRO', {
      code: 'TRO',
      label: 'Trojan',
      kind: 'trade',
      chains: new Set<ChainId>(['solana']),
      buildUrl: (address) =>
        `https://t.me/solana_trojanbot?start=r-chaindexter-${address}`,
    });

    map.set('TRT', {
      code: 'TRT',
      label: 'Trojan Terminal',
      kind: 'trade',
      chains: new Set<ChainId>(['solana']),
      buildUrl: (address) => `https://trojan.com/@chaindexter?token=${address}`,
    });

    map.set('JUP', {
      code: 'JUP',
      label: 'Jupiter',
      kind: 'trade',
      chains: new Set<ChainId>(['solana']),
      buildUrl: (address) => `https://jup.ag/swap/SOL-${address}`,
    });

    map.set('MAE', {
      code: 'MAE',
      label: 'Maestro',
      kind: 'trade',
      chains: new Set<ChainId>([
        'ethereum',
        'base',
        'bsc',
        'arbitrum',
        'polygon',
      ]),
      buildUrl: (address) =>
        `https://t.me/maestro?start=r-chaindexter&token=${address}`,
    });

    map.set('BAN', {
      code: 'BAN',
      label: 'BananaGun',
      kind: 'trade',
      chains: new Set<ChainId>([
        'ethereum',
        'base',
        'bsc',
        'arbitrum',
        'polygon',
      ]),
      buildUrl: (address) =>
        `https://t.me/BananaGunSniper_bot?start=ref_chaindexter-${address}`,
    });

    map.set('BM', {
      code: 'BM',
      label: 'BubbleMaps',
      kind: 'analysis',
      chains: new Set<ChainId>(['ethereum', 'base', 'bsc', 'solana']),
      buildUrl: (address, chain) =>
        `https://bubblemaps.io/map?address=${address}&chain=${chain}`,
    });

    return map;
  }
}
