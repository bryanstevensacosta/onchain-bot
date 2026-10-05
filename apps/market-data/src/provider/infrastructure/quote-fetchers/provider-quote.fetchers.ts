import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { CcxtService } from 'provider/infrastructure/ccxt';
import { CoinGeckoService } from 'provider/infrastructure/coingecko';
import { MobulaService } from 'provider/infrastructure/mobula';
import { MoralisService } from 'provider/infrastructure/moralis';
import { RugCheckService } from 'provider/infrastructure/rugcheck';
import { SolanaRpcService } from 'provider/infrastructure/solana-rpc';
import type {
  QuoteFetcher,
  SnapshotQuote,
} from 'snapshot/domain/snapshot-quote.types';

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function rpcAmountToUi(
  amount: string | null | undefined,
  decimals: number | null | undefined,
): number | null {
  const raw = toNumber(amount);
  if (raw === null || typeof decimals !== 'number' || decimals < 0) {
    return null;
  }
  const ui = raw / 10 ** decimals;
  return Number.isFinite(ui) ? ui : null;
}

/** GeckoTerminal network slugs differ from the catalog chain ids. */
const GECKO_NETWORK_SLUGS: Record<string, string> = {
  ethereum: 'eth',
  solana: 'solana',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon_pos',
};

export interface ProviderQuoteDeps {
  readonly dexscreener: DexScreenerService;
  readonly geckoterminal: GeckoTerminalService;
  readonly birdeye: BirdeyeService;
  readonly ccxt: CcxtService;
  readonly coingecko: CoinGeckoService;
  readonly mobula: MobulaService;
  readonly moralis: MoralisService;
  readonly rugcheck: RugCheckService;
  readonly solanaRpc: SolanaRpcService;
}

/**
 * Zero-cost cascade tiers (Tramo 3, consumer-probe).
 *
 * `free` providers answer with no API key (dexscreener, geckoterminal,
 * rugcheck, ccxt public tickers) and run 24/7 at $0. `keyed` providers
 * need their env key and return null without one — they are fallback
 * only: never called for cost, never throwing (skip, never 401-crash).
 * The builder order below keeps every `free` fetcher before every
 * `keyed` one; `zero-cost-cascade.spec.ts` pins this invariant.
 */
export const QUOTE_FETCHER_COST_TIER: Readonly<
  Record<string, 'free' | 'keyed'>
> = {
  ccxt: 'free',
  dexscreener: 'free',
  geckoterminal: 'free',
  'solana-rpc': 'free',
  rugcheck: 'free',
  birdeye: 'keyed',
  coingecko: 'keyed',
  mobula: 'keyed',
  moralis: 'keyed',
};

/**
 * Thin wrappers adapting the canonical adapters' EXISTING public methods
 * to the aggregator's `QuoteFetcher` shape (Tramo 3, todo-3 gap).
 *
 * No adapter internals change: each fetcher calls one public method and
 * normalizes to `Partial<SnapshotQuote>` (null when the adapter has no
 * data — missing key, unknown chain, or 404). Order is zero-cost first:
 * free providers ordered by coverage (ccxt CEX-only via `covers`,
 * dexscreener broadest onchain, geckoterminal broad onchain + supplies,
 * solana-rpc solana-only on-chain ground truth (totalSupply +
 * top10HolderPercent), rugcheck free security fields), then keyed providers as fallback
 * (birdeye, coingecko, mobula, moralis — null without keys, never
 * throwing). The aggregator merges first-non-null per field across all
 * of them in parallel. The ccxt fetcher short-circuits to null for
 * onchain addresses (`covers`), so uncovered inputs fall back untouched.
 */
export function buildProviderQuoteFetchers(
  deps: ProviderQuoteDeps,
): ReadonlyArray<QuoteFetcher> {
  const ccxt: QuoteFetcher = {
    name: 'ccxt',
    supportsChains: [
      'ethereum',
      'solana',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
    ],
    endpoint: 'ticker',
    covers: (_chain: string, address: string) =>
      CcxtService.isCexSymbol(address),
    fetch: async (_chain: string, address: string) => {
      const ticker = await deps.ccxt.fetchTicker(
        deps.ccxt.defaultExchange,
        address,
      );
      if (ticker === null || ticker.last === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd: ticker.last,
        symbol: ticker.symbol,
      };
      return quote;
    },
  };

  const dexscreener: QuoteFetcher = {
    name: 'dexscreener',
    supportsChains: [
      'ethereum',
      'solana',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
    ],
    fetch: async (chain: string, address: string) => {
      const best = await deps.dexscreener.getBestPairSummaryForChain(
        chain,
        address,
      );
      if (best === null) {
        return null;
      }
      // Pair-side attribution (plan todo 20): the best-liquidity pair
      // reports BOTH sides, but the requested mint may sit on either
      // one (USDC in a PUMP/USDC pool sits on the quote side). Resolve
      // identity from the matching side only — never default to base.
      // Pair with our mint on neither side is discarded (stale/foreign
      // row), returning null so the aggregator records `no data` and
      // moves on; never throws.
      //
      // Sibling check (repo-wide `baseToken` grep): geckoterminal
      // (`getTokenInfo`) and birdeye (`getTokenOverview`) query
      // per-address endpoints, so their identity is mint-bound by
      // construction — no side ambiguity there. Backend
      // `dexscreener.adapter.ts` + `ticker-resolver` are EXCLUDED
      // here on purpose: other app, other plan (they keep their own
      // base-side reads until that plan lands).
      const wanted = address.toLowerCase();
      const baseMatch =
        best.baseToken.address.toLowerCase() === wanted ? best.baseToken : null;
      const quoteMatch =
        typeof best.quoteToken.address === 'string' &&
        best.quoteToken.address.toLowerCase() === wanted
          ? best.quoteToken
          : null;
      const identity = baseMatch ?? quoteMatch;
      if (identity === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd: toNumber(best.priceUsd),
        marketCapUsd: toNumber(best.marketCap),
        fdvUsd: toNumber(best.fdv),
        liquidityUsd: toNumber(best.liquidityUsd),
        volume24hUsd: toNumber(best.volume24h),
        priceChange24h: toNumber(best.priceChange24h),
        symbol: identity.symbol || null,
        name: identity.name || null,
      };
      return quote;
    },
  };

  const geckoterminal: QuoteFetcher = {
    name: 'geckoterminal',
    supportsChains: ['ethereum', 'solana', 'bsc', 'base'],
    fetch: async (chain: string, address: string) => {
      const slug = GECKO_NETWORK_SLUGS[chain] ?? chain;
      const info = await deps.geckoterminal.getTokenInfo(slug, address);
      if (info === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd: toNumber(info.priceUsd),
        marketCapUsd: toNumber(info.marketCapUsd),
        fdvUsd: toNumber(info.fdvUsd),
        volume24hUsd: toNumber(info.volumeUsdH24),
        priceChange24h: toNumber(info.priceChangePercentH24),
        holders: toNumber(info.holders),
        top10HolderPercent: toNumber(info.top10HolderPercent),
        symbol: info.symbol,
        name: info.name,
        totalSupply: toNumber(info.totalSupply),
      };
      return quote;
    },
  };

  /** CoinGecko platform ids differ from the catalog chain ids. */
  const COINGECKO_PLATFORMS: Record<string, string> = {
    ethereum: 'ethereum',
    bsc: 'binance-smart-chain',
    base: 'base',
    arbitrum: 'arbitrum-one',
    polygon: 'polygon-pos',
    solana: 'solana',
  };

  const coingecko: QuoteFetcher = {
    name: 'coingecko',
    supportsChains: [
      'ethereum',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'solana',
    ],
    fetch: async (chain: string, address: string) => {
      const platform = COINGECKO_PLATFORMS[chain];
      if (!platform) {
        return null;
      }
      const info = await deps.coingecko.getTokenContractInfo(platform, address);
      if (info === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd: toNumber(info.priceUsd),
        marketCapUsd: toNumber(info.marketCapUsd),
        fdvUsd: toNumber(info.fdvUsd),
        volume24hUsd: toNumber(info.volumeUsdH24),
        priceChange24h: toNumber(info.priceChangePercent24h),
        totalSupply: toNumber(info.totalSupply),
        circulatingSupply: toNumber(info.circulatingSupply),
        maxSupply: toNumber(info.maxSupply),
      };
      return quote;
    },
  };

  const birdeye: QuoteFetcher = {
    name: 'birdeye',
    supportsChains: ['solana'],
    fetch: async (chain: string, address: string) => {
      const overview = await deps.birdeye.getTokenOverview(address, chain);
      if (overview === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd: toNumber(overview.price),
        marketCapUsd: toNumber(overview.mc),
        liquidityUsd: toNumber(overview.liquidity),
        volume24hUsd: toNumber(overview.volume24h),
        priceChange24h: toNumber(overview.priceChange24h),
        holders: toNumber(overview.holder),
        symbol: overview.symbol,
        name: overview.name,
        totalSupply: toNumber(overview.totalSupply),
      };
      return quote;
    },
  };

  const mobula: QuoteFetcher = {
    name: 'mobula',
    supportsChains: [
      'ethereum',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'solana',
    ],
    fetch: async (chain: string, address: string) => {
      const markets = await deps.mobula.getTokenMarkets(address, chain);
      if (markets === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd: toNumber(markets.priceUSD),
        liquidityUsd: toNumber(markets.approximateReserveUSD),
        marketCapUsd: toNumber(markets.marketCapUSD),
        fdvUsd: toNumber(markets.marketCapDilutedUSD),
        top10HolderPercent: toNumber(markets.top10HoldingsPercentage),
        totalSupply: toNumber(markets.totalSupply),
      };
      return quote;
    },
  };

  const moralis: QuoteFetcher = {
    name: 'moralis',
    supportsChains: ['ethereum', 'bsc', 'base', 'arbitrum', 'polygon'],
    fetch: async (chain: string, address: string) => {
      const [analytics, holders] = await Promise.all([
        deps.moralis.getTokenAnalytics(address, chain),
        deps.moralis.getTokenHolders(address, chain),
      ]);
      if (analytics === null && holders === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd: toNumber(analytics?.priceUsd),
        fdvUsd: toNumber(analytics?.fdvUsd),
        liquidityUsd: toNumber(analytics?.liquidityUsd),
        priceChange24h: toNumber(analytics?.priceChange24h),
        holders: toNumber(holders?.holders),
        top10HolderPercent: toNumber(holders?.top10HolderPercent),
      };
      return quote;
    },
  };

  const rugcheck: QuoteFetcher = {
    name: 'rugcheck',
    supportsChains: ['solana'],
    fetch: async (_chain: string, address: string) => {
      const summary = await deps.rugcheck.getSummary(address);
      if (summary === null) {
        return null;
      }
      const locked = (summary.lockedLiquidity ?? []).map(
        (entry) => entry.percent,
      );
      const quote: Partial<SnapshotQuote> = {
        lockedLiquidityPercent: locked.length > 0 ? Math.max(...locked) : null,
        burnedPercent: toNumber(summary.burnedPercent),
      };
      return quote;
    },
  };

  /**
   * Solana on-chain ground truth (coverage-expand): `getTokenSupply`
   * carries total only (no max / circulating leg exists on-chain);
   * `getTokenLargestAccounts` carries the top-20 accounts, from which
   * the top-10 share of the on-chain total derives. No key needed
   * (public JSON-RPC, free tier). RPC down -> null, never throws
   * (adversarial: the aggregator records `no data` and moves on).
   */
  const solanaRpc: QuoteFetcher = {
    name: 'solana-rpc',
    supportsChains: ['solana'],
    fetch: async (_chain: string, address: string) => {
      try {
        const [supply, largest] = await Promise.all([
          deps.solanaRpc.getTokenSupply(address),
          deps.solanaRpc.getTokenLargestAccounts(address),
        ]);
        const totalSupply =
          toNumber(supply?.uiAmount) ??
          rpcAmountToUi(supply?.amount, supply?.decimals);
        let top10HolderPercent: number | null = null;
        if (largest !== null && totalSupply !== null && totalSupply > 0) {
          const top10 = largest
            .slice(0, 10)
            .reduce(
              (acc, entry) =>
                acc +
                (toNumber(entry.uiAmount) ??
                  rpcAmountToUi(entry.amount, entry.decimals) ??
                  0),
              0,
            );
          top10HolderPercent = (top10 / totalSupply) * 100;
        }
        if (totalSupply === null && top10HolderPercent === null) {
          return null;
        }
        const quote: Partial<SnapshotQuote> = {
          totalSupply,
          top10HolderPercent,
        };
        return quote;
      } catch {
        return null;
      }
    },
  };

  return [
    ccxt,
    dexscreener,
    geckoterminal,
    solanaRpc,
    rugcheck,
    birdeye,
    coingecko,
    mobula,
    moralis,
  ];
}
