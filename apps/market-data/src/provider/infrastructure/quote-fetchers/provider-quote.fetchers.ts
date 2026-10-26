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
import type { MulticallClient } from 'provider/infrastructure/alchemy/multicall.service';
import {
  decodeDecimalsReturn,
  decodeUint256Return,
  encodeNoArgCall,
  ERC20_DECIMALS_SELECTOR,
  ERC20_TOTAL_SUPPLY_SELECTOR,
  rawAmountToUiAmount,
} from 'provider/infrastructure/onchain/evm-pools.codec';
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

/**
 * Birdeye token-overview `liquidity` is ONE-SIDE, while the core
 * `liquidityUsd` invariant is TOTAL (both sides): the direct fast paths
 * compute `stableUsd * 2` / `nativeAmount * nativeUsd * 2`, and Gecko
 * `reserve_in_usd` + DexScreener `liquidity.usd` are both total.
 *
 * Empirical cross-check (live, BSC PCS v2 pool
 * `0x7c5e1f873f02b042995d0c6ebee94120a740e348`): on-chain both sides =
 * $4,076.53, Gecko `reserve_in_usd` = $4,088.69, DexScreener
 * `liquidity.usd` = $4,064.73 — but Birdeye token-overview answered
 * $2,043.56 (≈ one side). Birdeye's public docs are silent on the
 * semantics, so this conclusion is EMPIRICAL (~90–95% one-side for that
 * pool). Convert at the adapter boundary: without it the merge flips
 * the card to half the real TVL (Birdeye 2K vs Gecko 4K).
 *
 * `null` stays `null` (never invent a measurement) and a real `0`
 * stays `0` (zero is a reading); no rounding — display rounding is the
 * renderer's business, and the display `liquidityUsdSide` (total/2) key
 * keeps its meaning untouched.
 *
 * RESIDUAL CAVEAT: token-overview may aggregate liquidity across the
 * token's pools, so this ×2 is a per-token TOTAL, not a per-pool TVL.
 * Re-audit the side semantics before wiring a per-pair endpoint here.
 */
function birdeyeOneSideToTotalUsd(value: number | null): number | null {
  return value === null ? null : value * 2;
}

/**
 * First non-empty GeckoTerminal `gt_category_ids` entry (dexter plan
 * todo 72), trimmed and verbatim. It is a CANDIDATE origin id only —
 * the snapshot seam validates it via `launchpadInfo`; never derived
 * from the address suffix, name, symbol or venue.
 */
function firstGeckoCategory(
  ids: ReadonlyArray<string> | null | undefined,
): string | null {
  if (!Array.isArray(ids)) return null;
  for (const entry of ids) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed.length > 0) return trimmed;
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

/**
 * EVM chains with a VERIFIED Multicall3 deployment (dexter plan todo
 * 54): exactly the `EVM_CHAIN_TRANSPORTS` rows whose `multicall3` is
 * non-null — 7 verified via `eth_getCode` 2026-10-05 (eth/base/bsc/arb/
 * poly/op/uni) + robinhood 2026-10-06 (see `alchemy.chains.ts` header
 * for the proof trail; a transposed address already burned us once, so
 * no row is ever inherited from memory). A spec pins this list EQUAL
 * to the transport table's non-null rows, so coverage can never
 * silently outgrow its `eth_getCode` proof.
 */
export const EVM_ONCHAIN_SUPPLY_CHAINS: ReadonlyArray<string> = [
  'ethereum',
  'base',
  'bsc',
  'arbitrum',
  'polygon',
  'optimism',
  'unichain',
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
  /**
   * EVM on-chain supply leg (dexter plan todo 54, optional):
   * `totalSupply()` + `decimals()` batched through the frozen Multicall3
   * `tryAggregate` transport (`MulticallService`, same seam Lane E uses).
   * Absent (every pre-existing caller/spec) -> the leg skips with `null`,
   * byte-identical — same precedent as `defillama`/`etherscan`.
   */
  readonly multicall?: MulticallClient;
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
  'evm-rpc': 'free',
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
 * top10HolderPercent), rugcheck free security fields, evm-rpc EVM
 * on-chain supply ground truth (todo 54, same `tryAggregate` seam)),
 * then keyed providers as fallback
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
      const txns1h = best.txns1h;
      const txns1hBuys =
        typeof txns1h?.buys === 'number' && Number.isFinite(txns1h.buys)
          ? txns1h.buys
          : null;
      const txns1hSells =
        typeof txns1h?.sells === 'number' && Number.isFinite(txns1h.sells)
          ? txns1h.sells
          : null;
      const quote: Partial<SnapshotQuote> = {
        priceUsd: toNumber(best.priceUsd),
        marketCapUsd: toNumber(best.marketCap),
        fdvUsd: toNumber(best.fdv),
        // Dedicated DSC-leg FDV (dexter plan todo 61): the ONLY source
        // of the null-only seam fallback. `fdvUsd` above stays for the
        // seam's discarded-reported debug-log; this field never lets a
        // foreign leg's reported value masquerade as DSC's.
        dexscreenerFdvUsd: toNumber(best.fdv),
        liquidityUsd: toNumber(best.liquidityUsd),
        volume24hUsd: toNumber(best.volume24h),
        // 1-hour bucket (dexter `1H` row): pair-level values from the
        // best-liquidity pair only. Absent/non-finite → null (never 0);
        // a real 0 survives. Only this leg writes these four fields.
        volume1hUsd: toNumber(best.volume1hUsd),
        priceChange1h: toNumber(best.priceChange1h),
        txns1hBuys,
        txns1hSells,
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
          // Pool-market fields off the SAME pick (dexter plan todo 72):
          // `0` survives for volume/change; liquidity is positive-guarded.
          liquidityUsd: pick.liquidityUsd,
          volume24hUsd: pick.volume24hUsd,
          priceChange24h: pick.priceChange24h,
          // 1H bucket off the SAME pick, same response (dexter `1H` row).
          // This leg is the ONLY producer for Gecko-only tokens: its own
          // `priceChange24h` makes the OHLC derivation early-return
          // (native-wins), so dropping these four would null the row.
          volume1hUsd: pick.volume1hUsd,
          priceChange1h: pick.priceChange1h,
          txns1hBuys: pick.txns1hBuys,
          txns1hSells: pick.txns1hSells,
        };
        return quote;
      }
      let priceUsd = toNumber(info.priceUsd);
      let fdvUsd = toNumber(info.fdvUsd);
      const needsPool = priceUsd === null || fdvUsd === null;
      const getPools = deps.geckoterminal.getTokenPools?.bind(
        deps.geckoterminal,
      );
      let poolPick: ReturnType<typeof selectPoolQuote> = null;
      if (needsPool && typeof getPools === 'function') {
        const pools = await getPools(slug, address);
        const pick = selectPoolQuote(pools, address);
        if (pick !== null) {
          poolPick = pick;
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
        // Pool-sourced liquidity (SAME picked pool, todo 72): only the
        // positive-guarded reserve; `0` is not a usable measurement.
        liquidityUsd: poolPick?.liquidityUsd ?? null,
        // `/info` wins when it carries the field (first-non-null merge
        // semantics); the pool pick fills only its gaps on the SAME
        // picked pool — `??` keeps a real `0` from either leg.
        volume24hUsd:
          toNumber(info.volumeUsdH24) ?? poolPick?.volume24hUsd ?? null,
        priceChange24h:
          toNumber(info.priceChangePercentH24) ??
          poolPick?.priceChange24h ??
          null,
        // 1H bucket off the SAME pool pick (`null` when no pool was
        // needed, absent key otherwise — the single-writer contract for
        // the common info-complete path stays byte-identical): `0`
        // survives, absent stays `null`, txns are a whole pair —
        // `selectPoolQuote` owns that contract. Zero extra calls.
        ...(poolPick === null
          ? {}
          : {
              volume1hUsd: poolPick.volume1hUsd,
              priceChange1h: poolPick.priceChange1h,
              txns1hBuys: poolPick.txns1hBuys,
              txns1hSells: poolPick.txns1hSells,
            }),
        holders: toNumber(info.holders),
        top10HolderPercent: toNumber(info.top10HolderPercent),
        symbol: info.symbol,
        name: info.name,
        totalSupply: toNumber(info.totalSupply),
        // Dedicated Gecko `/info` writer (dexter plan todo 72): first
        // non-empty `gt_category_ids` entry, a CANDIDATE origin id only
        // (validated at the snapshot seam; never identity, never the
        // address suffix). `null` when absent.
        geckoLaunchpadHint: firstGeckoCategory(info.gtCategoryIds),
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
        liquidityUsd: birdeyeOneSideToTotalUsd(toNumber(overview.liquidity)),
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
   * EVM on-chain supply leg (dexter plan todo 54, LAST free leg):
   * `totalSupply()` (`0x18160ddd`) + `decimals()` (`0x313ce567`) in ONE
   * Multicall3 `tryAggregate` (~26 CU flat; the documented per-call
   * fallback fires only when the aggregate transport itself misses)
   * across the 8 multicall-verified chains, normalized with the
   * BigInt-first `rawAmountToUiAmount` (`ui = uint256_raw / 10^decimals`;
   * `decimals > 255 | null` -> `null`; raw decode miss -> `null`).
   *
   * PROXY-SAFE by construction: both reads execute the token's OWN
   * code — for EIP-1967/UUPS/Beacon proxies that means the delegatecall
   * target (the live implementation reading its live storage); this leg
   * assumes NO implementation shape, pokes NO storage slots and reads NO
   * admin/impl slots, so a proxy upgrade cannot desync it. Worst case a
   * non-ERC20 / self-destructed target makes the inner call revert ->
   * `ok:false` -> `null` (fail-open, never a crash). Rebasing or
   * deflationary tokens resolve the SPOT supply at head block — the
   * honest FDV denominator (`fdv = price x total`, NEVER `circ`;
   * todo-38 invariant untouched: this leg emits ONLY `totalSupply` and
   * cannot bypass the computed-FDV seam, and `parseRetryAfter`-style
   * retry lives in the 19b2 wrapper, not here).
   *
   * Excluded by research 52 (do NOT re-open in this leg): CoinPaprika,
   * Etherscan `tokensupply` (raw without decimals), Helius-as-new
   * (Solana-only, already covered by `solana-rpc`), DeFiLlama /
   * DexScreener-derived. Supply here is chain ground truth (WENCAT 1B
   * live-verified vs DexScreener FDV within rounding — notepad
   * `.omo/notepads/dexter-supply-legs.md`).
   */
  const evmRpc: QuoteFetcher = {
    name: 'evm-rpc',
    supportsChains: [...EVM_ONCHAIN_SUPPLY_CHAINS],
    fetch: async (chain: string, address: string) => {
      if (deps.multicall === undefined || deps.multicall === null) {
        return null;
      }
      const results = await deps.multicall.tryAggregate(chain, [
        {
          target: address,
          callData: encodeNoArgCall(ERC20_TOTAL_SUPPLY_SELECTOR),
        },
        {
          target: address,
          callData: encodeNoArgCall(ERC20_DECIMALS_SELECTOR),
        },
      ]);
      const supplyRow = results[0] ?? null;
      const decimalsRow = results[1] ?? null;
      const supplyHex =
        supplyRow !== null && supplyRow.ok === true ? supplyRow.value : null;
      const decimalsHex =
        decimalsRow !== null && decimalsRow.ok === true
          ? decimalsRow.value
          : null;
      const raw = supplyHex === null ? null : decodeUint256Return(supplyHex);
      const decimals =
        decimalsHex === null ? null : decodeDecimalsReturn(decimalsHex);
      const totalSupply = rawAmountToUiAmount(raw, decimals);
      if (totalSupply === null) {
        return null;
      }
      const quote: Partial<SnapshotQuote> = { totalSupply };
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
    evmRpc,
    birdeye,
    coingecko,
    mobula,
    moralis,
    etherscan,
  ];
}
