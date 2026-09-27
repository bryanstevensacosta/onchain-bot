import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { MoralisService } from 'provider/infrastructure/moralis';
import { RugCheckService } from 'provider/infrastructure/rugcheck';
import type {
  QuoteFetcher,
  SnapshotQuote,
} from '../domain/snapshot-quote.types';

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
  readonly moralis: MoralisService;
  readonly rugcheck: RugCheckService;
}

/**
 * Thin wrappers adapting the canonical adapters' EXISTING public methods
 * to the aggregator's `QuoteFetcher` shape (Tramo 3, todo-3 gap).
 *
 * No adapter internals change: each fetcher calls one public method and
 * normalizes to `Partial<SnapshotQuote>` (null when the adapter has no
 * data — missing key, unknown chain, or 404). Order mirrors the backend
 * enrichment failover (dexscreener first); the aggregator merges
 * first-non-null per field across all of them in parallel.
 */
export function buildProviderQuoteFetchers(
  deps: ProviderQuoteDeps,
): ReadonlyArray<QuoteFetcher> {
  const dexscreener: QuoteFetcher = {
    name: 'dexscreener',
    supportsChains: ['ethereum', 'solana', 'bsc', 'base'],
    fetch: async (_chain: string, address: string) => {
      const best = await deps.dexscreener.getBestPairSummary(address);
      if (best === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd: toNumber(best.priceUsd),
        marketCapUsd: toNumber(best.marketCap),
        fdvUsd: toNumber(best.fdv),
        liquidityUsd: toNumber(best.liquidityUsd),
        volume24hUsd: toNumber(best.volume24h),
        priceChange24h: toNumber(best.priceChange24h),
        symbol: best.baseToken.symbol || null,
        name: best.baseToken.name || null,
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
      const locked = summary.lockedLiquidity.map((entry) => entry.percent);
      const quote: Partial<SnapshotQuote> = {
        lockedLiquidityPercent:
          locked.length > 0 ? Math.max(...locked) : null,
        burnedPercent: toNumber(summary.burnedPercent),
      };
      return quote;
    },
  };

  return [dexscreener, geckoterminal, birdeye, moralis, rugcheck];
}
