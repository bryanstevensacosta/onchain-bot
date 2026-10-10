import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import {
  resolveDexScreenerSlug,
  selectBestPairSummaryForSlug,
} from 'provider/infrastructure/dexscreener/dexscreener.service';
import {
  GeckoTerminalService,
  selectPoolQuote,
} from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { BIRDEYE_SUPPORTED_CHAINS } from 'provider/infrastructure/birdeye/birdeye.service';
import { CcxtService } from 'provider/infrastructure/ccxt';
import { CoinGeckoService } from 'provider/infrastructure/coingecko';
import { DefiLlamaService } from 'provider/infrastructure/defillama';
import { DEFILLAMA_SUPPORTED_CHAINS } from 'provider/infrastructure/defillama/defillama.service';
import { EtherscanService } from 'provider/infrastructure/etherscan';
import { ETHERSCAN_SUPPORTED_CHAINS } from 'provider/infrastructure/etherscan/etherscan.service';
import { MobulaService } from 'provider/infrastructure/mobula';
import { MoralisService } from 'provider/infrastructure/moralis';
import { RugCheckService } from 'provider/infrastructure/rugcheck';
import { SolanaRpcService } from 'provider/infrastructure/solana-rpc';
import type {
  QuoteFetcher,
  SnapshotQuote,
} from 'snapshot/domain/snapshot-quote.types';
import type { DexScreenerPairSummary } from 'provider/infrastructure/dexscreener/dexscreener.types';

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

/** GeckoTerminal network slugs verified live 2026-10-06 via `GET /networks`. */
export const GECKO_NETWORK_SLUGS: Record<string, string> = {
  ethereum: 'eth',
  solana: 'solana',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon_pos',
  optimism: 'optimism',
  unichain: 'unichain',
  robinhood: 'robinhood',
};

/** Our chains whose snapshots may consult GeckoTerminal (dexter plan todo 25). */
export const GECKO_SUPPORTED_CHAINS: ReadonlyArray<string> = [
  'ethereum',
  'solana',
  'bsc',
  'base',
  'arbitrum',
  'polygon',
  'robinhood',
];

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
  /**
   * New-provider legs (dexter plan todo 32, optional): absent (every
   * pre-existing caller/spec) -> the legs skip silently, byte-identical
   * (same precedent as `discoveryCache` + the todo-31 optional-method
   * guards). The snapshot module passes the real services.
   */
  readonly defillama?: DefiLlamaService;
  readonly etherscan?: EtherscanService;
  /**
   * Discovery cache (dexter plan todo 30b, optional): cache-first
   * discovery with tripwire verification. Absent (every existing
   * caller/spec) -> direct `getBestPairSummaryForChain`, byte-
   * identical. Structural type on purpose — the provider layer
   * never imports from snapshot/; the snapshot module passes the
   * real `DiscoveryCacheService` (structurally compatible).
   */
  readonly discoveryCache?: {
    resolveDiscovery(
      chain: string,
      address: string,
    ): Promise<DexScreenerPairSummary | null>;
  };
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
  defillama: 'free',
  birdeye: 'keyed',
  coingecko: 'keyed',
  mobula: 'keyed',
  moralis: 'keyed',
  etherscan: 'keyed',
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
      'robinhood',
      'unichain',
    ],
    fetch: async (chain: string, address: string) => {
      // Discovery cache first (dexter plan todo 30b): tripwire-
      // verified cached discovery on hit, direct strict discovery
      // otherwise. Side-verification below is unchanged either way.
      //
      // Fallback legs (dexter plan todo 31, keyless 60/min/endpoint —
      // each fires ONLY on the previous leg's null, so the common
      // strict-hit path costs exactly 1 call as before): `search`
      // answers symbol-typed / thin-pair addresses the strict
      // `token-pairs/v1` route misses, and `tokens/v1` (batch-shaped,
      // single address here) covers rows the search index skips.
      // Every leg shares `selectBestPairSummaryForSlug` (strict
      // `chainId === slug` filter + best-liquidity pick), and the
      // pair-side identity check below applies to all three — no leg
      // can smuggle a cross-chain or foreign-mint row. Adapters keep
      // their own null-collapse; `RetryableProviderError` still
      // propagates to the 19b2 single-retry wrapper (never swallowed).
      const slug = resolveDexScreenerSlug(chain);
      if (slug === null) {
        return null;
      }
      const strict =
        deps.discoveryCache !== undefined && deps.discoveryCache !== null
          ? await deps.discoveryCache.resolveDiscovery(chain, address)
          : await deps.dexscreener.getBestPairSummaryForChain(chain, address);
      let best = strict;
      // Optional-method guards (same precedent as the geckoterminal
      // `getTokenPools` leg below): hand-rolled stub deps in older
      // specs only implement `getBestPairSummaryForChain` — the
      // fallback legs skip silently there instead of throwing.
      const searchPairs = deps.dexscreener.search?.bind(deps.dexscreener);
      if (best === null && typeof searchPairs === 'function') {
        const searched = await searchPairs(address);
        best =
          searched === null
            ? null
            : selectBestPairSummaryForSlug(searched, slug);
      }
      const tokensInfo = deps.dexscreener.getTokensInfo?.bind(deps.dexscreener);
      if (best === null && typeof tokensInfo === 'function') {
        const infos = await tokensInfo(slug, address);
        best =
          infos === null ? null : selectBestPairSummaryForSlug(infos, slug);
      }
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
    supportsChains: [...GECKO_SUPPORTED_CHAINS],
    fetch: async (chain: string, address: string) => {
      const slug = GECKO_NETWORK_SLUGS[chain] ?? chain;
      // Optional-method guards (todo 31 legs; same precedent as the
      // `getTokenPools` leg): older stub deps implement `getTokenInfo`
      // only — new legs skip silently there instead of throwing.
      const getMulti = deps.geckoterminal.getTokensMulti?.bind(
        deps.geckoterminal,
      );
      const getSimple = deps.geckoterminal.getSimpleTokenPrice?.bind(
        deps.geckoterminal,
      );
      const searchPools = deps.geckoterminal.searchPools?.bind(
        deps.geckoterminal,
      );
      let info = await deps.geckoterminal.getTokenInfo(slug, address);
      if (info === null && typeof getMulti === 'function') {
        const batch = await getMulti(slug, [address]);
        const wanted = address.toLowerCase();
        info =
          batch?.find(
            (entry) =>
              typeof entry.address === 'string' &&
              entry.address.toLowerCase() === wanted,
          ) ?? null;
      }
      if (info === null) {
        // Gecko-only discovery leg (dexter plan todo 31, keyless):
        // the token `/info` route 404s but the pool index already
        // carries the pair (STAGEVEIL-pattern) — pool numbers only,
        // identity stays null (never invented).
        if (typeof searchPools !== 'function') return null;
        const found = await searchPools(address);
        const pick = selectPoolQuote(found, address);
        if (pick === null) return null;
        const quote: Partial<SnapshotQuote> = {
          priceUsd: pick.priceUsd,
          fdvUsd: pick.fdvUsd,
        };
        return quote;
      }
      let priceUsd = toNumber(info.priceUsd);
      let fdvUsd = toNumber(info.fdvUsd);
      const needsPool = priceUsd === null || fdvUsd === null;
      const getPools = deps.geckoterminal.getTokenPools?.bind(
        deps.geckoterminal,
      );
      if (needsPool && typeof getPools === 'function') {
        const pools = await getPools(slug, address);
        const pick = selectPoolQuote(pools, address);
        if (pick !== null) {
          priceUsd ??= pick.priceUsd;
          fdvUsd ??= pick.fdvUsd;
        }
      }
      if (priceUsd === null && typeof getSimple === 'function') {
        const prices = await getSimple(slug, [address]);
        priceUsd = prices?.[address.toLowerCase()] ?? null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd,
        marketCapUsd: toNumber(info.marketCapUsd),
        fdvUsd,
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
    supportsChains: [...BIRDEYE_SUPPORTED_CHAINS],
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
      if (markets !== null) {
        const quote: Partial<SnapshotQuote> = {
          priceUsd: toNumber(markets.priceUSD),
          liquidityUsd: toNumber(markets.approximateReserveUSD),
          marketCapUsd: toNumber(markets.marketCapUSD),
          fdvUsd: toNumber(markets.marketCapDilutedUSD),
          top10HolderPercent: toNumber(markets.top10HoldingsPercentage),
          totalSupply: toNumber(markets.totalSupply),
        };
        return quote;
      }
      // Cheap price fallback (dexter plan todo 31, keyed latency leg):
      // the heavy `token/markets` view missed, but the pool-based
      // `token/price` leg may still serve price + mcap + liquidity in
      // one cheap call instead of a null. Existing markets-hit path
      // above is byte-identical (the leg fires ONLY on its null).
      const getPrice = deps.mobula.getTokenPrice?.bind(deps.mobula);
      if (typeof getPrice !== 'function') return null;
      const priced = await getPrice(address, chain);
      if (priced === null) return null;
      const priceUsd = toNumber(priced.priceUSD);
      const marketCapUsd = toNumber(priced.marketCapUSD);
      const fdvUsd = toNumber(priced.marketCapDilutedUSD);
      const liquidityUsd = toNumber(priced.liquidityUSD);
      if (
        priceUsd === null &&
        marketCapUsd === null &&
        fdvUsd === null &&
        liquidityUsd === null
      ) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd,
        marketCapUsd,
        fdvUsd,
        liquidityUsd,
        symbol: priced.symbol ?? null,
        name: priced.name ?? null,
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
      if (summary !== null) {
        const locked = (summary.lockedLiquidity ?? []).map(
          (entry) => entry.percent,
        );
        const quote: Partial<SnapshotQuote> = {
          lockedLiquidityPercent:
            locked.length > 0 ? Math.max(...locked) : null,
          burnedPercent: toNumber(summary.burnedPercent),
        };
        return quote;
      }
      // Search fallback (dexter plan todo 31, keyless): no report for
      // this mint, but the search index may rank it (legit-first) with
      // holders + mcap on the row. Exact-mint match only — a near
      // miss is a different token, never a substitute. `getNewTokens`
      // is NOT called here (feed, not per-address — quota discipline).
      const searchRows = deps.rugcheck.search?.bind(deps.rugcheck);
      if (typeof searchRows !== 'function') return null;
      const rows = await searchRows(address);
      const match = rows?.find((row) => row?.mint === address) ?? null;
      if (match === null) return null;
      const holders = toNumber(match.holders);
      const marketCapUsd = toNumber(match.mcap);
      if (holders === null && marketCapUsd === null) return null;
      const quote: Partial<SnapshotQuote> = {
        holders,
        marketCapUsd,
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

  /**
   * DeFiLlama keyless price leg (dexter plan todo 32, LAST free leg —
   * fallback-after-incumbents: the merge is first-non-null in order,
   * so this only fills price gaps the five free legs above leave).
   * `prices/current` carries price + mint-bound symbol ONLY (no
   * mcap/fdv/liq on this surface, ever). Chart/ATH is deliberately
   * NOT called here (coarse 1-point series proven 2026-10-09 — ATH
   * stays own-history per the ATH-history rule). Absent service (every
   * pre-existing stub) -> null without network.
   */
  const defillama: QuoteFetcher = {
    name: 'defillama',
    supportsChains: [...DEFILLAMA_SUPPORTED_CHAINS],
    fetch: async (chain: string, address: string) => {
      if (deps.defillama === undefined || deps.defillama === null) {
        return null;
      }
      const priced = await deps.defillama.getPrice(chain, address);
      if (priced === null) {
        return null;
      }
      const priceUsd = toNumber(priced.price);
      if (priceUsd === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = {
        priceUsd,
        symbol:
          typeof priced.symbol === 'string' && priced.symbol.length > 0
            ? priced.symbol
            : null,
      };
      return quote;
    },
  };

  /**
   * Etherscan V2 keyed holders leg (dexter plan todo 32, LAST leg
   * overall — fallback-after-incumbents). Maps ONLY the exact holder
   * count (`action=tokenholdercount`, PRO-gated so free-key answers
   * are null — expected, documented). Supply (`tokensupply`, raw base
   * units without decimals) and verified (`getsourcecode`, no
   * `SnapshotQuote` column) stay service-level, never mapped — mapping
   * either would poison `totalSupply` or invent a column. Absent
   * service OR absent key -> null without network.
   */
  const etherscan: QuoteFetcher = {
    name: 'etherscan',
    supportsChains: [...ETHERSCAN_SUPPORTED_CHAINS],
    fetch: async (chain: string, address: string) => {
      if (deps.etherscan === undefined || deps.etherscan === null) {
        return null;
      }
      const holders = await deps.etherscan.getTokenHolderCount(chain, address);
      if (holders === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = { holders };
      return quote;
    },
  };

  return [
    ccxt,
    dexscreener,
    geckoterminal,
    solanaRpc,
    rugcheck,
    defillama,
    birdeye,
    coingecko,
    mobula,
    moralis,
    etherscan,
  ];
}
