import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { AggregationOutcome } from 'aggregators/application/snapshot-aggregator.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import type { DexScreenerPairSummary } from 'provider/infrastructure/dexscreener';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import type { LaunchpadInfo } from 'launchpad/domain/launchpad-info';
import {
  addressToBytes,
  findProgramAddress,
  utf8Seed,
} from 'launchpad/infrastructure/solana-pda';
import { OnchainEvmReaderService } from 'provider/infrastructure/onchain/onchain-evm.reader';
import { OnchainSolanaReaderService } from 'provider/infrastructure/onchain/onchain-solana.reader';
import type { OnchainPoolView } from 'provider/infrastructure/onchain/onchain-solana.reader';
import { PUMP_FUN_PROGRAM } from 'provider/infrastructure/onchain/solana-program-ids';
import { base64ToBytes } from 'provider/infrastructure/onchain/codec-utils';
import { decodeRaydiumClmm } from 'provider/infrastructure/onchain/raydium-pools.codec';
import { SolanaRpcService } from 'provider/infrastructure/solana-rpc';
import type { BatchAccountsClient } from 'provider/infrastructure/solana-rpc/solana-rpc.types';
import { toVenueOrNull } from 'snapshot/domain/snapshot-venue';
import type { SnapshotVenue } from 'snapshot/domain/snapshot-venue';
import {
  emptySnapshotQuote,
  type SnapshotQuote,
} from 'snapshot/domain/snapshot-quote.types';

/**
 * Direct fast-path resolver (todo 22 wire-up — Lane E readers serving).
 *
 * Tries the on-chain readers FIRST under a HARD deadline
 * (`DIRECT_FAST_PATH_DEADLINE_MS`, default 800ms): a
 * per-attempt AbortController is created and aborted on deadline,
 * and the work is raced so stragglers are never awaited beyond
 * budget. Caveat (documented, not hidden): the frozen Lane T
 * transports (`MulticallClient.tryAggregate`,
 * `BatchAccountsClient.getMultiple`) take NO external signal, so
 * the deadline is race-enforced at this seam — abandoned sockets
 * die on the transports' own internal timeouts (7.5s/5s EVM,
 * ~10s Solana). The race is what the render waits on.
 *
 * COVERAGE (honest, not universal):
 * - Solana: pool view from the DexScreener-discovered pair address
 *   (owner dispatch covers pump curve / Raydium / Orca / Meteora)
 *   PLUS a no-intermediary pump-curve PDA attempt derived from the
 *   mint (parallel; pool view wins when both are sane so graduated
 *   tokens read the AMM, not the frozen curve). Token basics
 *   (supply/holders/metadata) ride along in parallel.
 * - EVM: DexScreener best-pair discovery is REQUIRED (a token
 *   address alone cannot name its pair) + V2/V3 reads (labels hint
 *   the family, else both race and first-sane wins). V4 poolIds
 *   (64-hex pairAddress) are shape-guarded to fail-open null —
 *   full V4 routing needs a lens + decimals this seam lacks.
 * - USD rule: price is served ONLY against a USD-stable leg
 *   (pinned per chain, `EVM_STABLES` / `SOL_STABLES`) or via a
 *   pinned native-anchor pool read (SOL/USDC on solana, WETH/USDC
 *   on ethereum — both owner-verified live, dates in comments).
 *   No stable leg and no anchor -> `null` -> fallback. No invented
 *   FX: a depegged "stable" reads 1:1 and the tolerance log is
 *   the tripwire (documented assumption).
 *
 * SANE-VALUE GATE (everything else -> `null` -> byte-identical
 * fallback): pool legs must contain the requested mint (exact
 * match — the todo 20 pair-side lesson); priceUsd finite in
 * (0, 1e12); liquidityUsd finite in [0, 1e14); anchor native/USD
 * inside a wide plausibility band. `null` here is never an error
 * — it is the "not covered" signal.
 *
 * Served cards are PARTIAL by design (todo 22 card-parcial rule):
 * direct fields (price/liquidity/holders/supply/identity) + N/A
 * nulls for aggregator-only fields (volume24h/ATH/socials/...).
 * Nothing here touches the pipeline — the caller owns serve vs
 * fallback, caching, history, and the background tolerance run.
 */

export const DIRECT_FAST_PATH_DEADLINE_MS = 800;
export const DIRECT_FAST_PATH_SOURCE = 'onchain-direct';

export interface DirectFastPathRequest {
  readonly chain: string;
  readonly address: string;
  readonly kind: string;
}

export interface DirectFastPathResult {
  readonly outcome: AggregationOutcome;
  /** Venue derived from the discovery pair (no extra call). */
  readonly venue: SnapshotVenue | null;
  /** Launchpad raced inside the deadline (null = slow/unknown). */
  readonly launchpad: LaunchpadInfo | null;
  readonly timings: {
    readonly discoveryMs: number | null;
    readonly directMs: number;
    readonly launchpadMs: number | null;
    readonly totalMs: number;
  };
}

/** Helper-stage result: `totalMs` is stamped by `tryResolve`. */
type FastPartial = Omit<DirectFastPathResult, 'timings'> & {
  readonly timings: Omit<DirectFastPathResult['timings'], 'totalMs'>;
};

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
/** Solana USDC + USDT mints (canonical). */
const SOL_STABLES: ReadonlyArray<string> = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNY5',
];
/**
 * SOL/USD anchor: Raydium AMMv4 SOL/USDC, owner-verified live
 * 2026-10-06 (`getAccountInfo` owner =
 * `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8`). If this pool
 * ever rots, the anchor read fails sane-gates -> fallback
 * (fail-open, never a wrong price).
 */
const SOL_USDC_ANCHOR_POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
/**
 * Lean anchor (1 RPC round, no vault batch): Raydium CLMM SOL/USDC,
 * owner-verified live 2026-10-06 (`CAMMCzo5YL8w4VFF8KVHrK22G
 * Usp5VTaW7grrKgrWqK` = RAYDIUM_CLMM_PROGRAM). The CLMM struct
 * carries mint decimals on-chain, so the spot needs no follow-up
 * reads — mint match first, then pure math. Tried BEFORE the AMM
 * anchor (same race); either may win on latency, both gate sanity.
 */
const SOL_USDC_LEAN_ANCHOR_POOL =
  '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv';
const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC_ETHEREUM = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDT_ETHEREUM = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const DAI_ETHEREUM = '0x6b175474e89094c44da98b954eedeac495271d0f';
const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const USDT_BSC = '0x55d398326f99059ff775485246999027b3197955';
const USDC_BSC = '0x8ac7230489e800d8c5a3c5dc8c1bea7aa5e9f4c2';
/** Lowercased stable legs per OUR chain id (exact-address match). */
const EVM_STABLES: Readonly<Record<string, ReadonlyArray<string>>> = {
  ethereum: [USDC_ETHEREUM, USDT_ETHEREUM, DAI_ETHEREUM],
  base: [USDC_BASE],
  bsc: [USDT_BSC, USDC_BSC],
};
/**
 * Native-anchor pools per OUR chain id (WETH-quoted pairs without
 * a stable leg convert through these; Lane E live-verified).
 * Chains WITHOUT a row are stable-leg-only (honest gap, not a bug).
 */
const EVM_NATIVE_ANCHOR_POOL: Readonly<Record<string, string>> = {
  // Uniswap V2 WETH/USDC, verified 2026-10-05 (Lane E probe).
  ethereum: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc',
};
const EVM_WNATIVE: Readonly<Record<string, string>> = {
  ethereum: WETH_ADDRESS,
};

/** Absurdity caps (wide — they catch bugs, not markets). */
const MAX_SANE_PRICE_USD = 1e12;
const MAX_SANE_LIQUIDITY_USD = 1e14;
const MIN_SANE_ANCHOR_NATIVE_USD = 1;
const MAX_SANE_ANCHOR_NATIVE_USD = 1e6;

const isSanePrice = (value: number | null): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0 &&
  value < MAX_SANE_PRICE_USD;

const isSaneLiquidity = (value: number | null): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value < MAX_SANE_LIQUIDITY_USD;

const lower = (address: string): string => address.trim().toLowerCase();

/**
 * V4 poolId shape check (dexter plan todo 28, Robinhood 64-hex fix).
 *
 * Uniswap V4 pools are named by a bytes32 poolId (64 hex chars), NOT
 * by an EVM address (40 hex). DexScreener reports that poolId in
 * `pairAddress`, and the V2/V3 readers below take the value as an
 * `eth_call`/`eth_getCode` target — a 64-hex target answers `-32602
 * (hex string has length 64, want 40)` on EVERY tier (alchemy + dRPC
 * + public), i.e. a wasted walk that can only fail. Guard here, at
 * the single seam, fail-open `null`.
 *
 * Full V4 routing (`getV4PoolView` + `encodeBytes32ArgCall`, both
 * verified to exist) does NOT apply at this seam: it needs a
 * verified StateView lens for the chain (`v4StateViewForChain` has
 * ethereum/base rows only — robinhood has NO row) PLUS both leg
 * decimals (discovery carries none, and this seam owns no decimals
 * source). Neither holds for the motivating Robinhood case, so the
 * v4 branch resolves to the same fail-open `null` with a distinct
 * log — no tier walk, no invented lens/decimals. Follow-up (a new
 * todo, NOT this one): verify lens rows per chain + plumb leg
 * decimals, then route `getV4PoolView(chain, poolId, dec0, dec1)`.
 */
const isBytes32PoolId = (value: string): boolean => {
  const raw = value.trim();
  const hex = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
  return /^[0-9a-fA-F]{64}$/.test(hex);
};

/**
 * USD value of `reserve` (raw bigint) of a leg KNOWN to be a USD
 * proxy (stable mint, 1 unit ~= $1). `decimals` null -> null.
 */
const stableReserveUsd = (
  reserve: bigint,
  decimals: number | null,
): number | null => {
  if (decimals === null || !Number.isInteger(decimals)) return null;
  const value = Number(reserve) / 10 ** decimals;
  return Number.isFinite(value) && value >= 0 ? value : null;
};

@Injectable()
export class DirectFastPathService {
  private readonly logger = new Logger(DirectFastPathService.name);

  public constructor(
    @Optional()
    @Inject(DexScreenerService)
    private readonly dexscreener: DexScreenerService | null = null,
    // Union-typed params emit `Object` metadata: `@Inject` is mandatory
    // on each, otherwise Nest resolves null even when registered.
    @Optional()
    @Inject(OnchainSolanaReaderService)
    private readonly solanaReader: OnchainSolanaReaderService | null = null,
    @Optional()
    @Inject(OnchainEvmReaderService)
    private readonly evmReader: OnchainEvmReaderService | null = null,
    @Optional()
    @Inject(LaunchpadDetectorService)
    private readonly launchpadDetector: LaunchpadDetectorService | null = null,
    // Raw batch client for the lean 1-round CLMM anchor (the reader's
    // pool views cost 2 rounds via vault batches — over budget here).
    @Optional()
    @Inject(SolanaRpcService)
    private readonly accounts: BatchAccountsClient | null = null,
  ) {}

  public async tryResolve(
    request: DirectFastPathRequest,
    deadlineMs: number = DIRECT_FAST_PATH_DEADLINE_MS,
  ): Promise<DirectFastPathResult | null> {
    const startedAt = performance.now();
    try {
      const chain = (request.chain ?? '').trim();
      const address = (request.address ?? '').trim();
      if (request.kind !== 'token' || chain === '' || address === '') {
        return null;
      }
      const controller = new AbortController();
      // HARD deadline: the render races this rejection — stragglers
      // are never awaited beyond budget (their sockets die on the
      // transports' own internal timeouts; see file header).
      let timer: ReturnType<typeof setTimeout> | null = null;
      const onDeadline = new Promise<null>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('direct-fast-path deadline'));
        }, deadlineMs);
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
      });
      try {
        const result = await Promise.race([
          chain === 'solana'
            ? this.resolveSolana(address, controller.signal)
            : this.resolveEvm(chain, address, controller.signal),
          onDeadline,
        ]);
        if (result === null) return null;
        return {
          ...result,
          timings: {
            ...result.timings,
            totalMs: performance.now() - startedAt,
          },
        };
      } finally {
        if (timer !== null) {
          clearTimeout(timer);
        }
      }
    } catch {
      return null;
    }
  }

  // ── Solana ────────────────────────────────────────────────────

  private async resolveSolana(
    mint: string,
    signal: AbortSignal,
  ): Promise<FastPartial | null> {
    if (this.solanaReader === null) return null;
    const reader = this.solanaReader;
    const t0 = performance.now();
    const discoveryP: Promise<DexScreenerPairSummary | null> =
      this.dexscreener === null
        ? Promise.resolve(null)
        : this.dexscreener
            .getBestPairSummaryForChain('solana', mint)
            .catch(() => null);
    // No-intermediary leg: curve PDA derives FROM the mint (local
    // derivation, one batch read). Runs even when discovery dies.
    // Derived FIRST: when discovery names the same account the pool
    // leg is a pure duplicate and gets skipped below.
    let curvePda: string | null = null;
    try {
      curvePda = findProgramAddress(
        [utf8Seed('bonding-curve'), addressToBytes(mint)],
        PUMP_FUN_PROGRAM,
      ).address;
    } catch {
      curvePda = null;
    }
    const pdaP: Promise<OnchainPoolView | null> =
      curvePda === null
        ? Promise.resolve(null)
        : reader.getPoolView(curvePda, mint).catch(() => null);
    const basicsP = reader.getTokenBasics(mint).catch(() => null);
    // Launchpad rides detached: priced first, then take-if-ready (a
    // slow detector resolves null instead of burning the budget).
    let launchpadValue: LaunchpadInfo | null = null;
    const launchTracked =
      this.launchpadDetector === null
        ? Promise.resolve(false)
        : this.launchpadDetector.detectLaunchpad('solana', mint).then(
            (found) => {
              launchpadValue = found;
              return true;
            },
            () => false,
          );
    // Pool leg needs discovery first (pairAddress -> pool account),
    // unless discovery names the curve PDA itself (same account the
    // PDA leg already reads — fetching twice would double the rounds).
    const poolP: Promise<OnchainPoolView | null> = discoveryP.then(
      (summary) => {
        if (summary === null || signal.aborted) return null;
        if (curvePda !== null && summary.pairAddress === curvePda) return null;
        return reader.getPoolView(summary.pairAddress, mint).catch(() => null);
      },
    );
    // Lean anchor starts NOW (speculative 1-round read): SOL-quoted
    // views consume it with zero added rounds; stable-quoted ignore it.
    const anchorLeanP = this.leanAnchorSolUsd(signal);
    const [discovery, pdaView, basics, poolView, leanAnchor] =
      await Promise.all([discoveryP, pdaP, basicsP, poolP, anchorLeanP]);
    if (signal.aborted) return null;
    const discoveryMs = performance.now() - t0;
    // Pool view wins over the PDA view (graduated tokens must read
    // the AMM, never the frozen curve).
    const view =
      this.viewForMint(poolView, mint) ?? this.viewForMint(pdaView, mint);
    if (view === null) return null;
    const directStart = performance.now();
    const priced = await this.priceSolanaView(view, reader, signal, leanAnchor);
    if (priced === null || signal.aborted) return null;
    // Take the launchpad ONLY if it already won its own race — never
    // an extra millisecond of waiting past pricing.
    const launchReady = await Promise.race([
      launchTracked,
      Promise.resolve(false),
    ]);
    const launchpad = launchReady ? launchpadValue : null;
    const quote: SnapshotQuote = {
      ...emptySnapshotQuote(),
      priceUsd: priced.priceUsd,
      liquidityUsd: priced.liquidityUsd,
      holders:
        basics !== null && basics.holders !== null
          ? basics.holders.length
          : null,
      top10HolderPercent: basics?.top10SharePercent ?? null,
      symbol: basics?.metadata?.symbol ?? discoverySideSymbol(discovery, mint),
      name: basics?.metadata?.name ?? discoverySideName(discovery, mint),
      totalSupply: supplyToNumber(basics?.supply ?? null),
      marketCapUsd: marketCapOf(priced.priceUsd, basics?.supply ?? null),
      fdvUsd: marketCapOf(priced.priceUsd, basics?.supply ?? null),
    };
    return {
      outcome: {
        quote,
        sources: [DIRECT_FAST_PATH_SOURCE],
        errors: {
          [DIRECT_FAST_PATH_SOURCE]:
            'fast-path partial card: aggregator-only fields (volume24h/ATH/socials) N/A',
        },
        allFailed: false,
      },
      venue:
        discovery === null
          ? null
          : toVenueOrNull({ dexId: discovery.dexId, labels: discovery.labels }),
      launchpad,
      timings: {
        discoveryMs,
        directMs: performance.now() - directStart,
        launchpadMs: null,
      },
    };
  }

  /** Pool view is usable only when the requested mint is ON it. */
  private viewForMint(
    view: OnchainPoolView | null,
    mint: string,
  ): OnchainPoolView | null {
    if (view === null) return null;
    const legs = view.legs;
    if (legs.length !== 2 || (legs[0].mint !== mint && legs[1].mint !== mint)) {
      return null;
    }
    return view;
  }

  /**
   * Lean SOL/USD anchor: ONE `getMultiple` on the pinned CLMM pool.
   * The struct carries mints + decimals on-chain; the only pinned
   * facts are the pool address and the WSOL/USDC mints it must
   * contain (anything else -> null). Spot math mirrors the Lane S
   * reader (`(sqrtP/2^64)^2`, decimals-applied, orientation by mint
   * match) — pinned by the lean-anchor spec below.
   */
  private async leanAnchorSolUsd(signal: AbortSignal): Promise<number | null> {
    try {
      if (this.accounts === null || signal.aborted) return null;
      const fetched = await this.accounts.getMultiple([
        SOL_USDC_LEAN_ANCHOR_POOL,
      ]);
      const account = fetched[0] ?? null;
      if (account === null || signal.aborted) return null;
      const bytes = base64ToBytes(account.data[0]);
      if (bytes === null) return null;
      const decoded = decodeRaydiumClmm(bytes);
      if (decoded === null) return null;
      const aIsSol = decoded.mintA === WSOL_MINT;
      const bIsSol = decoded.mintB === WSOL_MINT;
      const aIsUsd = SOL_STABLES.includes(decoded.mintA);
      const bIsUsd = SOL_STABLES.includes(decoded.mintB);
      if (!((aIsSol && bIsUsd) || (bIsSol && aIsUsd))) return null;
      const raw = Number(decoded.sqrtPriceX64) / 2 ** 64;
      if (!Number.isFinite(raw) || raw <= 0) return null;
      const spotBA = raw * raw;
      const decA = decoded.mintDecimalsA;
      const decB = decoded.mintDecimalsB;
      if (!Number.isInteger(decA) || !Number.isInteger(decB)) return null;
      const perAinB = spotBA * 10 ** (decA - decB);
      if (!Number.isFinite(perAinB) || perAinB <= 0) return null;
      // perAinB = B-per-A: SOL is whichever side holds WSOL.
      const solUsd = aIsSol ? perAinB : 1 / perAinB;
      return Number.isFinite(solUsd) && solUsd > 0 ? solUsd : null;
    } catch {
      return null;
    }
  }

  /** Full-view AMM anchor (2 rounds): fallback when the lean spot misses. */
  private async ammAnchorSolUsd(
    reader: OnchainSolanaReaderService,
    signal: AbortSignal,
  ): Promise<number | null> {
    try {
      const anchor = await reader
        .getPoolView(SOL_USDC_ANCHOR_POOL)
        .catch(() => null);
      if (anchor === null || signal.aborted) return null;
      return usdPerSolFromAnchor(anchor);
    } catch {
      return null;
    }
  }

  /**
   * USD price + liquidity for a mint-bearing pool view. Stable leg
   * -> direct; SOL leg -> pinned SOL/USDC anchor read; neither ->
   * null (not covered, never guessed).
   */
  private async priceSolanaView(
    view: OnchainPoolView,
    reader: OnchainSolanaReaderService,
    signal: AbortSignal,
    leanAnchorSolUsd: number | null,
  ): Promise<{ priceUsd: number; liquidityUsd: number } | null> {
    const legs = view.legs;
    if (legs.length !== 2) return null;
    const [legA, legB] = [legs[0], legs[1]] as [
      (typeof legs)[0],
      (typeof legs)[0],
    ];
    const stableLeg = SOL_STABLES.includes(legA.mint)
      ? legA
      : SOL_STABLES.includes(legB.mint)
        ? legB
        : null;
    const otherLeg =
      stableLeg === null ? null : stableLeg === legA ? legB : legA;
    if (stableLeg !== null && otherLeg !== null) {
      const stableUsd = stableReserveUsd(stableLeg.reserve, stableLeg.decimals);
      const otherAmount = amountOf(otherLeg);
      if (stableUsd === null || otherAmount === null || otherAmount <= 0) {
        return null;
      }
      const priceUsd = stableUsd / otherAmount;
      if (!isSanePrice(priceUsd)) return null;
      const liquidityUsd = stableUsd * 2;
      if (!isSaneLiquidity(liquidityUsd)) return null;
      return { priceUsd, liquidityUsd };
    }
    // SOL-quoted: anchor through a pinned SOL/USDC pool — lean CLMM
    // spot first (1 round), full AMM view as fallback (2 rounds).
    const solLeg =
      legA.mint === WSOL_MINT ? legA : legB.mint === WSOL_MINT ? legB : null;
    const tokenLeg = solLeg === null ? null : solLeg === legA ? legB : legA;
    if (solLeg === null || tokenLeg === null || signal.aborted) return null;
    const solUsd =
      leanAnchorSolUsd ?? (await this.ammAnchorSolUsd(reader, signal));
    if (
      solUsd === null ||
      solUsd < MIN_SANE_ANCHOR_NATIVE_USD ||
      solUsd > MAX_SANE_ANCHOR_NATIVE_USD
    ) {
      return null;
    }
    const solAmount = amountOf(solLeg);
    const tokenAmount = amountOf(tokenLeg);
    if (solAmount === null || tokenAmount === null || tokenAmount <= 0) {
      return null;
    }
    const priceUsd = (solAmount / tokenAmount) * solUsd;
    if (!isSanePrice(priceUsd)) return null;
    const liquidityUsd = solAmount * solUsd * 2;
    if (!isSaneLiquidity(liquidityUsd)) return null;
    return { priceUsd, liquidityUsd };
  }

  // ── EVM ───────────────────────────────────────────────────────

  private async resolveEvm(
    chain: string,
    address: string,
    signal: AbortSignal,
  ): Promise<FastPartial | null> {
    const reader = this.evmReader;
    const discoveryService = this.dexscreener;
    if (reader === null || discoveryService === null) {
      return null;
    }
    const t0 = performance.now();
    const discovery = await discoveryService
      .getBestPairSummaryForChain(chain, address)
      .catch(() => null);
    const discoveryMs = performance.now() - t0;
    if (discovery === null || signal.aborted) return null;
    const mint = lower(address);
    const baseIsMint = lower(discovery.baseToken.address) === mint;
    const quoteIsMint =
      discovery.quoteToken.address !== null &&
      lower(discovery.quoteToken.address) === mint;
    if (!baseIsMint && !quoteIsMint) return null;
    // 64-hex guard (todo 28): a bytes32 poolId is not an address —
    // V2/V3 readers would burn every RPC tier on -32602. V4 routing
    // does not apply at this seam (no lens row for most chains incl.
    // robinhood; no leg decimals from discovery) -> fail-open null.
    if (isBytes32PoolId(discovery.pairAddress)) {
      this.logger.debug(
        `resolveEvm v4-poolId skip (64-hex, no tier walk): ${chain} ${address}`,
      );
      return null;
    }
    const labels = discovery.labels.map((label) => label.toLowerCase());
    const families: ReadonlyArray<'v2' | 'v3'> = labels.includes('v3')
      ? ['v3']
      : labels.includes('v2')
        ? ['v2']
        : ['v2', 'v3'];
    const directStart = performance.now();
    let launchpadValue: LaunchpadInfo | null = null;
    const launchTracked =
      this.launchpadDetector === null
        ? Promise.resolve(false)
        : this.launchpadDetector.detectLaunchpad(chain, address).then(
            (found) => {
              launchpadValue = found;
              return true;
            },
            () => false,
          );
    const views = await Promise.all(
      families.map((family) =>
        family === 'v2'
          ? reader.getV2PoolView(chain, discovery.pairAddress).catch(() => null)
          : reader
              .getV3PoolView(chain, discovery.pairAddress)
              .catch(() => null),
      ),
    );
    if (signal.aborted) return null;
    for (const view of views) {
      if (view === null) continue;
      const priced =
        'legs' in view
          ? await this.priceEvmV2View(chain, mint, view, signal)
          : this.priceEvmV3View(chain, mint, view);
      if (priced === null) continue;
      const launchReady = await Promise.race([
        launchTracked,
        Promise.resolve(false),
      ]);
      const identity = baseIsMint
        ? discovery.baseToken
        : {
            address: discovery.quoteToken.address ?? address,
            name: discovery.quoteToken.name ?? '',
            symbol: discovery.quoteToken.symbol ?? '',
          };
      const quote: SnapshotQuote = {
        ...emptySnapshotQuote(),
        priceUsd: priced.priceUsd,
        liquidityUsd: priced.liquidityUsd,
        // Discovery-sourced identity (same side-verified source the
        // dexscreener fetcher uses — documented, not chain-read).
        symbol: identity.symbol === '' ? null : identity.symbol,
        name: identity.name === '' ? null : identity.name,
      };
      return {
        outcome: {
          quote,
          sources: [DIRECT_FAST_PATH_SOURCE],
          errors: {
            [DIRECT_FAST_PATH_SOURCE]:
              'fast-path partial card: aggregator-only fields (volume24h/ATH/supply/holders) N/A' +
              (priced.liquidityNote !== null
                ? `; ${priced.liquidityNote}`
                : ''),
          },
          allFailed: false,
        },
        venue: toVenueOrNull({
          dexId: discovery.dexId,
          labels: discovery.labels,
        }),
        launchpad: launchReady ? launchpadValue : null,
        timings: {
          discoveryMs,
          directMs: performance.now() - directStart,
          launchpadMs: null,
        },
      };
    }
    return null;
  }

  private async priceEvmV2View(
    chain: string,
    mint: string,
    view: {
      readonly legs: readonly [
        {
          readonly token: string;
          readonly reserve: bigint;
          readonly decimals: number | null;
        },
        {
          readonly token: string;
          readonly reserve: bigint;
          readonly decimals: number | null;
        },
      ];
      readonly price1Per0: number | null;
    },
    signal: AbortSignal,
  ): Promise<{
    priceUsd: number;
    liquidityUsd: number | null;
    liquidityNote: string | null;
  } | null> {
    const legs = view.legs;
    const [leg0, leg1] = legs;
    if (lower(leg0.token) !== mint && lower(leg1.token) !== mint) {
      return null;
    }
    const stables = EVM_STABLES[chain] ?? [];
    const stableLeg = stables.includes(lower(leg0.token))
      ? leg0
      : stables.includes(lower(leg1.token))
        ? leg1
        : null;
    const otherLeg =
      stableLeg === null ? null : stableLeg === leg0 ? leg1 : leg0;
    if (stableLeg !== null && otherLeg !== null) {
      const stableUsd = stableReserveUsd(stableLeg.reserve, stableLeg.decimals);
      const otherAmount = amountOf(otherLeg);
      if (stableUsd === null || otherAmount === null || otherAmount <= 0) {
        return null;
      }
      const priceUsd = stableUsd / otherAmount;
      if (!isSanePrice(priceUsd)) return null;
      const liquidityUsd = stableUsd * 2;
      if (!isSaneLiquidity(liquidityUsd)) return null;
      return { priceUsd, liquidityUsd, liquidityNote: null };
    }
    // Native-quoted without a stable leg: anchor through the pinned
    // native/USDC pool (ethereum only — other chains: not covered).
    const wnative = EVM_WNATIVE[chain];
    const anchorPool = EVM_NATIVE_ANCHOR_POOL[chain];
    if (
      wnative === undefined ||
      anchorPool === undefined ||
      this.evmReader === null ||
      signal.aborted
    ) {
      return null;
    }
    const wnativeLeg =
      lower(leg0.token) === wnative
        ? leg0
        : lower(leg1.token) === wnative
          ? leg1
          : null;
    const tokenLeg =
      wnativeLeg === null ? null : wnativeLeg === leg0 ? leg1 : leg0;
    if (wnativeLeg === null || tokenLeg === null) return null;
    const anchorView = await this.evmReader
      .getV2PoolView(chain, anchorPool)
      .catch(() => null);
    if (anchorView === null || signal.aborted) return null;
    const anchorLegs = anchorView.legs;
    const anchorStable = stables.includes(lower(anchorLegs[0].token))
      ? anchorLegs[0]
      : stables.includes(lower(anchorLegs[1].token))
        ? anchorLegs[1]
        : null;
    const anchorNative =
      anchorStable === null
        ? null
        : anchorStable === anchorLegs[0]
          ? anchorLegs[1]
          : anchorLegs[0];
    if (anchorStable === null || anchorNative === null) return null;
    const anchorStableUsd = stableReserveUsd(
      anchorStable.reserve,
      anchorStable.decimals,
    );
    const anchorNativeAmount = amountOf(anchorNative);
    if (
      anchorStableUsd === null ||
      anchorNativeAmount === null ||
      anchorNativeAmount <= 0
    ) {
      return null;
    }
    const nativeUsd = anchorStableUsd / anchorNativeAmount;
    if (
      nativeUsd < MIN_SANE_ANCHOR_NATIVE_USD ||
      nativeUsd > MAX_SANE_ANCHOR_NATIVE_USD
    ) {
      return null;
    }
    const nativeAmount = amountOf(wnativeLeg);
    const tokenAmount = amountOf(tokenLeg);
    if (nativeAmount === null || tokenAmount === null || tokenAmount <= 0) {
      return null;
    }
    const priceUsd = (nativeAmount / tokenAmount) * nativeUsd;
    if (!isSanePrice(priceUsd)) return null;
    const liquidityUsd = nativeAmount * nativeUsd * 2;
    if (!isSaneLiquidity(liquidityUsd)) return null;
    return { priceUsd, liquidityUsd, liquidityNote: null };
  }

  /**
   * V3 spot -> USD. The reader's `price1Per0` is token1-per-token0
   * (decimals-applied, null when leg decimals missed), so with the
   * stable side known by address the orientation is exact — no
   * guessing, no anchor. TVL is NOT on-chain in the slot0 lens, so
   * V3 liquidity is honestly null (note in providerErrors).
   */
  private priceEvmV3View(
    chain: string,
    mint: string,
    view: {
      readonly token0: string;
      readonly token1: string;
      readonly price1Per0: number | null;
    },
  ): {
    priceUsd: number;
    liquidityUsd: number | null;
    liquidityNote: string | null;
  } | null {
    const spot = view.price1Per0;
    if (spot === null || !Number.isFinite(spot) || spot <= 0) return null;
    const stables = EVM_STABLES[chain] ?? [];
    const token0IsMint = lower(view.token0) === mint;
    const token1IsMint = lower(view.token1) === mint;
    if (!token0IsMint && !token1IsMint) return null;
    let priceUsd: number | null = null;
    if (token0IsMint && stables.includes(lower(view.token1))) {
      priceUsd = spot;
    } else if (token1IsMint && stables.includes(lower(view.token0))) {
      priceUsd = 1 / spot;
    }
    if (!isSanePrice(priceUsd)) return null;
    return {
      priceUsd,
      liquidityUsd: null,
      liquidityNote: 'v3 TVL not on-chain in slot0 lens',
    };
  }
}

// ── shared math ─────────────────────────────────────────────────

const amountOf = (leg: {
  readonly reserve: bigint;
  readonly decimals: number | null;
}): number | null => {
  if (leg.decimals === null || !Number.isInteger(leg.decimals)) return null;
  const value = Number(leg.reserve) / 10 ** leg.decimals;
  return Number.isFinite(value) && value >= 0 ? value : null;
};

/** USDC-per-SOL from an anchor pool view (legs must be WSOL+USDC). */
const usdPerSolFromAnchor = (anchor: OnchainPoolView): number | null => {
  const legs = anchor.legs;
  if (legs.length !== 2) return null;
  const [legA, legB] = [legs[0], legs[1]] as [
    (typeof legs)[0],
    (typeof legs)[0],
  ];
  const solLeg =
    legA.mint === WSOL_MINT ? legA : legB.mint === WSOL_MINT ? legB : null;
  const usdLeg =
    solLeg === null
      ? null
      : solLeg === legA
        ? SOL_STABLES.includes(legB.mint)
          ? legB
          : null
        : SOL_STABLES.includes(legA.mint)
          ? legA
          : null;
  if (solLeg === null || usdLeg === null) return null;
  const sol = amountOf(solLeg);
  const usd = stableReserveUsd(usdLeg.reserve, usdLeg.decimals);
  if (sol === null || usd === null || sol <= 0) return null;
  return usd / sol;
};

const supplyToNumber = (
  supply: { readonly amount: string; readonly decimals: number } | null,
): number | null => {
  if (supply === null) return null;
  const raw = Number(supply.amount);
  if (!Number.isFinite(raw) || raw < 0) return null;
  const value = raw / 10 ** supply.decimals;
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const marketCapOf = (
  priceUsd: number,
  supply: { readonly amount: string; readonly decimals: number } | null,
): number | null => {
  // Assumption (documented): mint supply ~= circulating for most
  // SPL mints, so marketCap and fdv coincide on the fast card.
  // The fan-out remains the source of truth for split supplies.
  const total = supplyToNumber(supply);
  if (total === null) return null;
  const value = priceUsd * total;
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const discoverySideSymbol = (
  discovery: DexScreenerPairSummary | null,
  mint: string,
): string | null => {
  if (discovery === null) return null;
  if (lower(discovery.baseToken.address) === lower(mint)) {
    return discovery.baseToken.symbol;
  }
  return discovery.quoteToken.symbol;
};

const discoverySideName = (
  discovery: DexScreenerPairSummary | null,
  mint: string,
): string | null => {
  if (discovery === null) return null;
  if (lower(discovery.baseToken.address) === lower(mint)) {
    return discovery.baseToken.name;
  }
  return discovery.quoteToken.name;
};
