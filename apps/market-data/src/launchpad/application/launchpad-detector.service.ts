import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import axios from 'axios';
import { CacheService } from 'cache/application/cache.service';
import { AlchemyService } from 'provider/infrastructure/alchemy/alchemy.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { resolveDexScreenerSlug } from 'provider/infrastructure/dexscreener/dexscreener.service';
import { HeliusService } from 'provider/infrastructure/helius/helius.service';
import { SolanaRpcService } from 'provider/infrastructure/solana-rpc/solana-rpc.service';
import type { LaunchpadInfo } from '../domain/launchpad-info';
import type { LaunchpadDetectorPort } from '../domain/launchpad-detector.port';
import {
  corroboratePumpSuffix,
  hasPumpSuffix,
} from '../domain/pump-suffix-corroboration';
import {
  BANKR_API_BASE,
  BELIEVE_DEPLOYERS,
  BONKFUN_PLATFORM_CONFIGS,
  BOOP_PROGRAM,
  EVM_CHAIN_TRANSPORTS,
  EVM_FACTORY_SETS,
  EVM_LAUNCHPAD_ORDER,
  EVM_RECEIPT_EXCLUDED,
  HEAVEN_POOL_STATE_URL,
  HEAVEN_PROGRAM,
  HELIUS_ORIGIN_PROGRAM_TO_LAUNCHPAD,
  MINTCLUB_API_BASE,
  MOONIT_PROGRAM,
  PONS_LAUNCHPAD_BASE,
  PUMP_FUN_PROGRAM,
  RAYDIUM_LAUNCHLAB_PROGRAM,
  STONKFUN_PLATFORM_CONFIGS,
  USDC_MINT,
  WSOL_MINT,
  launchpadInfo,
} from '../domain/launchpad-table';
import {
  addressToBytes,
  findProgramAddress,
  utf8Seed,
} from '../infrastructure/solana-pda';

const HTTP_TIMEOUT_MS = 8_000;
const DETECTOR_TIMEOUT_MS = 10_000;

/**
 * Detector slow-leg deadline (dexter plan todo 35 + parallel follow-up):
 * the Pons SSR leg measures ~1.3s live (ponsfamily server-render) and
 * the bankr 404 miss measures ~1.6s live — SEQUENTIAL they sum to
 * ~3.2s and NEVER fit the ~2s budget (the tail fires first, Pons never
 * resolves). Config default, NOT hardcoded: env
 * `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS`, default 2000. The deadline is ONE
 * shared wall-clock instant (detect start + slowLegMs): EVERY
 * network-bound EVM leg (bankr, mintclub, Pons SSR, factory fallback)
 * gets its OWN AbortController cut at that same instant, so no leg
 * outlives the budget and the slow legs overlap (total ~= max, not
 * sum). Precedence is by POSITION, not finish order (bankr > mintclub
 * > pons > factory — specific-before-generic, as before); all-fail
 * resolves null. Fast paths (malformed input, chain-alias miss, a hit
 * that short-circuits the factory fallback) never touch extra legs,
 * so fast-path timing is unchanged when they hit. The snapshot tail
 * waits on the whole detector up to this same value (its own budget,
 * not the 400ms).
 */
export const DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT = 2_000;

export function resolveDetectorSlowLegTimeoutMs(
  raw: string | undefined,
): number {
  if (raw === undefined) return DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) {
    return DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT;
  }
  return Math.floor(ms);
}

/**
 * Pons positive-cache TTL (dexter plan todo 35): origin is IMMUTABLE
 * per mint (a migration mints a NEW address), so a resolved `pons`
 * never goes stale — the TTL is a memory-hygiene bound, not a
 * correctness bound. Env `PONS_CACHE_TTL_DAYS`, default 14 (inside the
 * 7–30d band). Positive resolutions ONLY (never nulls — the 19a
 * no-negative-cache rule); a miss or an expired row re-probes SSR.
 */
export const PONS_CACHE_TTL_DAYS_DEFAULT = 14;

export function resolvePonsCacheTtlSeconds(raw: string | undefined): number {
  if (raw === undefined) {
    return PONS_CACHE_TTL_DAYS_DEFAULT * 24 * 60 * 60;
  }
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) {
    return PONS_CACHE_TTL_DAYS_DEFAULT * 24 * 60 * 60;
  }
  return Math.floor(days * 24 * 60 * 60);
}

/**
 * Pons cache key (chain + mint, lowercased — EVM checksum casing must
 * not fork the row). Namespaced so it never collides with the
 * `snapshot:*` hot rows sharing the same CacheService store.
 */
export const ponsCacheKey = (chain: string, address: string): string =>
  `pons:launchpad:${(chain ?? '').trim().toLowerCase()}:${(address ?? '').trim().toLowerCase()}`;

// Flap positive-cache TTL (dexter plan todo 44, Phase B): same
// rationale as the Pons cache above — origin is IMMUTABLE per mint,
// so the TTL is a memory-hygiene bound, not a correctness bound.
// Env `FLAP_CACHE_TTL_DAYS`, default 14 (inside the 7–30d band).
// Positive resolutions ONLY (never nulls — the 19a
// no-negative-cache rule). Served from the SAME shared CacheService
// primitive (separate `flap:launchpad:` namespace, no collision
// with `pons:` or `snapshot:*` rows); NO new table, same
// memory-store + reset-on-deploy tradeoff as the breaker.
export const FLAP_CACHE_TTL_DAYS_DEFAULT = 14;

export function resolveFlapCacheTtlSeconds(raw: string | undefined): number {
  if (raw === undefined) {
    return FLAP_CACHE_TTL_DAYS_DEFAULT * 24 * 60 * 60;
  }
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) {
    return FLAP_CACHE_TTL_DAYS_DEFAULT * 24 * 60 * 60;
  }
  return Math.floor(days * 24 * 60 * 60);
}

export const flapCacheKey = (chain: string, address: string): string =>
  `flap:launchpad:${(chain ?? '').trim().toLowerCase()}:${(address ?? '').trim().toLowerCase()}`;

/**
 * Flap factory-mismatch negative-cache TTL (fix 5): a FRESH factory
 * receipt that explicitly names a non-Flap factory is negative
 * evidence for a WHOLE 15-minute window — unlike the transient
 * Alchemy gaps (missing key / 429 / empty / throw), which are NEVER
 * negative-cached. Kept SEPARATE from the 14-day positive
 * `flap:launchpad:` rows (different namespace + TTL): the positive
 * cache means "this token launched on Flap" (immutable), the negative
 * one means "this receipt was checked and was not Flap" (bounded
 * freshness, so a mis-read cannot pin a token forever).
 *
 * Env `FLAP_FACTORY_MISMATCH_TTL_MS`, default 900_000 ms (15 min).
 */
export const FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT = 15 * 60 * 1000;

export function resolveFlapFactoryMismatchTtlMs(
  raw: string | undefined,
): number {
  if (raw === undefined) return FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) {
    return FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT;
  }
  return Math.floor(ms);
}

/**
 * Negative-cache key (chain + mint, lowercased — EVM checksum casing
 * must not fork the row). Deliberately a DIFFERENT namespace than the
 * 14-day positive `flap:launchpad:` key so the two TTLs never
 * collide.
 */
export const flapFactoryMismatchCacheKey = (
  chain: string,
  address: string,
): string =>
  `flap:factory-mismatch:${(chain ?? '').trim().toLowerCase()}:${(address ?? '').trim().toLowerCase()}`;

/** Flap page fallback budget (fix 5): keyless SSR page read, ~2.5s. */
export const FLAP_PAGE_TIMEOUT_MS_DEFAULT = 2_500;

/**
 * Helius-origin leg budget (dexter plan todo 36, graduated-old
 * tokens with closed curves): how much history to pull and how long
 * the archival sequence may run.
 *
 * - `HELIUS_ORIGIN_HISTORY_LIMIT = 100` reuses the seam default
 *   (`helius.service.ts:180-198`). Deliberate deviation from a
 *   literal "limit 1": Helius serves history newest-first, so
 *   limit-1 returns the NEWEST tx — useless for origin. The leg
 *   sorts the window slot-ascending and full-fetches exactly ONE
 *   (the earliest), so the "full-tx fetch ONLY for that one" rule
 *   holds. Window-honesty limit: the true genesis may lie deeper
 *   than the 100 newest (INCOME live 2026-10-10: window
 *   450534185→453388576, earliest = generic ATA
 *   INITIALIZE_ACCOUNT, no known program) — pagination is a
 *   quota-expensive follow-up, deferred; the leg reports
 *   earliest-in-window, never claims genesis.
 * - `HELIUS_ORIGIN_TIMEOUT_MS_DEFAULT = 8000` (env
 *   `LAUNCHPAD_HELIUS_ORIGIN_TIMEOUT_MS`): archival legs are SLOW
 *   by nature (2 sequential Enhanced-API calls, 8s axios backstop
 *   each) and intentionally exceed the ~2s brand-leg deadline and
 *   the snapshot tail wait — the tail fails open on cold scans and
 *   the origin lands on a later pass. Bounded by the outer 10s
 *   `DETECTOR_TIMEOUT_MS`; over-budget aborts to null (the in-flight
 *   Helius calls are not cancellable — no AbortSignal on the seam —
 *   but are capped at 2 per fire by construction).
 *
 * Quota math (why no cache, no throttle): per fire EXACTLY 2 Helius
 * Enhanced-API calls (1 history + 1 parse, zero retries in-leg —
 * 429 → null), and the leg fires ONLY for Solana mints where the
 * PDA batch + heaven both miss (closed/absent curves — a small
 * minority of scans; live-curve tokens cost 0 Helius calls). Noise
 * vs the 300 req/min internal budget and the ~10rps free tier.
 */
export const HELIUS_ORIGIN_HISTORY_LIMIT = 100;
export const HELIUS_ORIGIN_TIMEOUT_MS_DEFAULT = 8_000;

export function resolveHeliusOriginTimeoutMs(raw: string | undefined): number {
  if (raw === undefined) return HELIUS_ORIGIN_TIMEOUT_MS_DEFAULT;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) {
    return HELIUS_ORIGIN_TIMEOUT_MS_DEFAULT;
  }
  return Math.floor(ms);
}

/**
 * Minimal origin-tx view for the Helius mapper (structural — the
 * shared `HeliusParsedTransaction` is assignable: `signer` narrows
 * to readonly, `instructions[].programId` matches). `feePayer` is
 * NOT on the shared type (live full-tx may carry it beside
 * `signer`); read tolerantly, never required.
 */
export interface HeliusOriginTx {
  readonly instructions?: ReadonlyArray<{
    readonly programId?: string;
  }> | null;
  readonly signer?: ReadonlyArray<string> | null;
  readonly feePayer?: string | null;
}

/**
 * Pure origin→launchpad mapper (todo 36 actor table, executable
 * form of `HELIUS_ORIGIN_PROGRAM_TO_LAUNCHPAD` + Believe rule):
 * first KNOWN instruction program id in tx order wins (creation ix
 * leads); else the fee-payer (else first signer) against
 * `BELIEVE_DEPLOYERS` (empty today → never fires — the allowlist
 * IS the leg, per the R1 Believe-mutability rule); else null.
 * NEVER reads token name/symbol (mutable metadata — grep-provable:
 * no `name`/`symbol` access below). Unknown actor → null, no
 * guessing. `launchpadInfo` re-validates the id downstream, so a
 * stale table key fails open.
 */
export function mapHeliusOriginToLaunchpad(
  tx: HeliusOriginTx | null | undefined,
): string | null {
  if (tx === null || tx === undefined) return null;
  const instructions = tx.instructions ?? [];
  for (const ix of instructions) {
    const pid = typeof ix?.programId === 'string' ? ix.programId : '';
    if (pid === '') continue;
    const id = HELIUS_ORIGIN_PROGRAM_TO_LAUNCHPAD[pid] ?? null;
    if (id !== null) return id;
  }
  const rawSigner = tx.signer ?? [];
  const firstSigner =
    rawSigner.length > 0 && typeof rawSigner[0] === 'string'
      ? rawSigner[0]
      : null;
  const payer =
    typeof tx.feePayer === 'string' && tx.feePayer !== ''
      ? tx.feePayer
      : firstSigner;
  if (typeof payer === 'string' && BELIEVE_DEPLOYERS.includes(payer)) {
    return 'believe';
  }
  return null;
}

const SOLANA_CHAINS = new Set(['solana', 'sol']);

const EVM_CHAIN_ALIASES: Record<string, string> = {
  eth: 'ethereum',
  ethereum: 'ethereum',
  bnb: 'bsc',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  'arbitrum-one': 'arbitrum',
  matic: 'polygon',
  polygon: 'polygon',
  robinhood: 'robinhood',
  optimism: 'optimism',
  avalanche: 'avalanche',
};

const MINTCLUB_NUMERIC_CHAIN: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
  robinhood: 4663,
};

const BANKR_CHAINS = new Set(['base', 'robinhood']);

/** Chains where the Pons SSR registry leg may fire (Pons is Robinhood-native). */
const PONS_CHAINS = new Set(['robinhood']);

/**
 * flapsh-corroboration gate (dexter plan todo 60, from research 57):
 * `dexId: 'flapsh'` is Flap's own DEX id — 6 pairs observed in
 * research 57 (`dexter-flapsh-pair-research.md`), ALL `chainId: bsc`
 * (live bonding, stock-paired, and frozen post-migration), zero
 * outside BSC. The gate keeps the ONE keyless DSC pair-list call
 * scoped to where the marker can exist; extend it (with a fresh
 * probe, never from memory) if Flap ever ships `flapsh` on another
 * chain. The pair read ALSO filters `chainId === <slug>` inside
 * `detectFlapshPair`, so a cross-chain row can never corroborate a
 * different chain's card (chain-honesty doctrine, todo 18).
 */
export const FLAPSH_CORROBORATION_CHAINS: ReadonlySet<string> = new Set([
  'bsc',
]);

const RECEIPT_MATCH_ORDER = EVM_LAUNCHPAD_ORDER.filter(
  (id) => !(id in EVM_RECEIPT_EXCLUDED),
);

/**
 * Phase-2 factory verdict (fix 5). `unavailable` means the evidence
 * needed for a verdict was missing (no DI, no creation hash, no
 * receipt/`to`) — TRANSIENT, never negative-cached and eligible for
 * the keyless page fallback. `mismatch` means the receipt WAS read and
 * explicitly named a non-Flap factory — negative-cached for
 * `FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT` and blockING the page for
 * that scan (the page is weaker evidence and never overturns it).
 */
type FactoryVerdict =
  | { readonly kind: 'match'; readonly id: string }
  | { readonly kind: 'mismatch' }
  | { readonly kind: 'unavailable' };

const FACTORY_UNAVAILABLE: FactoryVerdict = { kind: 'unavailable' };

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('launchpad timeout')), ms);
  });
  return Promise.race([work, guard]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * LaunchpadDetector (dexter-launchpad Wave 1, Lane D).
 *
 * `detectLaunchpad(chain, address)` — and nothing else — resolves the
 * ORIGIN launchpad via the ratified ordered strategy array (specific
 * brand BEFORE generic infra, FIRST match wins). Solana legs batch
 * every PDA candidate into ONE `getMultipleAccounts` call; EVM legs
 * run the brand-API slow legs CONCURRENTLY (bankr ‖ mintclub ‖ Pons
 * SSR via `Promise.allSettled` under ONE shared ~2s deadline, each
 * with its own AbortController cut at the same instant — total ~=
 * max, not sum), picked by POSITION not finish order, then the ONE
 * Alchemy `getAssetTransfers` creation lookup + ONE receipt fetch
 * ONLY on API all-miss (a Pons hit never consults the factory
 * receipt). The receipt `to` factory match is the mandatory
 * factory gate (fix 5; the retired Blockscout leg is gone); a BSC
 * token with no available hash/receipt may additionally corroborate
 * via the keyless `flap.sh/bnb/<token>` page, and an explicit
 * non-Flap receipt is negative-cached for ~15 min.
 * Solana all-miss falls through to ONE archival Helius history leg
 * (earliest-in-window full-tx → program-id actor table; EVM never
 * touches Helius — Solana Enhanced-API only). Every external call
 * carries a timeout; anything unknown, slow, or failed resolves to
 * `null` — this service never throws outward.
 *
 * BSC flapsh corroboration (todo 60, from research 57): Phase 2 also
 * carries ONE keyless DSC pair-list check (`/latest/dex/tokens/<mint>`)
 * run CONCURRENTLY with the factory leg under the same shared
 * deadline. A `dexId: 'flapsh'` pair corroborates launchpad `flap`
 * ONLY when every detector positive missed (never the reverse);
 * absence is NEVER negative evidence (caveat a) and the read accepts
 * the quote side (stock-paired tokens have the launch on
 * `quoteToken`). Precedence pinned: dexter override (rank 1,
 * dexter-side, untouched here) > detector-positive >
 * flapsh-corroborated > null.
 */
@Injectable()
export class LaunchpadDetectorService implements LaunchpadDetectorPort {
  private readonly logger = new Logger(LaunchpadDetectorService.name);

  /**
   * Slow-leg deadline instance value (env `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS`,
   * default `DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT`). Read once at
   * construction — no per-request config lookup on the detect path.
   */
  private readonly slowLegMs: number = resolveDetectorSlowLegTimeoutMs(
    process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'],
  );

  private readonly ponsTtlSeconds: number = resolvePonsCacheTtlSeconds(
    process.env['PONS_CACHE_TTL_DAYS'],
  );

  private readonly flapTtlSeconds: number = resolveFlapCacheTtlSeconds(
    process.env['FLAP_CACHE_TTL_DAYS'],
  );

  private readonly flapMismatchTtlMs: number = resolveFlapFactoryMismatchTtlMs(
    process.env['FLAP_FACTORY_MISMATCH_TTL_MS'],
  );

  private readonly heliusOriginMs: number = resolveHeliusOriginTimeoutMs(
    process.env['LAUNCHPAD_HELIUS_ORIGIN_TIMEOUT_MS'],
  );

  public constructor(
    private readonly solanaRpc: SolanaRpcService,
    @Optional()
    @Inject(CacheService)
    private readonly ponsCache: CacheService | null = null,
    @Optional()
    private readonly helius: HeliusService | null = null,
    @Optional()
    @Inject(DexScreenerService)
    private readonly dexscreener: DexScreenerService | null = null,
    @Optional()
    @Inject(AlchemyService)
    private readonly alchemy: AlchemyService | null = null,
  ) {}

  public async detectLaunchpad(
    chain: string,
    address: string,
  ): Promise<LaunchpadInfo | null> {
    try {
      return await withTimeout(
        this.detectInner((chain ?? '').trim(), (address ?? '').trim()),
        DETECTOR_TIMEOUT_MS,
      );
    } catch (err) {
      this.logger.debug(
        `detectLaunchpad null (chain=${chain}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async detectInner(
    chain: string,
    address: string,
  ): Promise<LaunchpadInfo | null> {
    if (chain === '' || address === '') return null;
    const normalized = chain.toLowerCase();
    if (SOLANA_CHAINS.has(normalized)) {
      const result = await this.detectSolana(address);
      // Pump-suffix seam (dexter plan todo 48, rank 3,
      // corroboration-only): observe-only annotation — NEVER alters the
      // verdict (suffix-alone stays null per R1
      // `.omo/plans/dexter-launchpad.md:57`). The debug lines below are
      // the ONLY observable; `corroborated` is never plumbed
      // (silent-with-reason — see `pump-suffix-corroboration.ts`).
      const { corroborated } = corroboratePumpSuffix(
        result?.id ?? null,
        address,
      );
      if (corroborated) {
        this.logger.debug(`pump-suffix corroborated (mint=${address})`);
      } else if (result === null && hasPumpSuffix(address)) {
        this.logger.debug(
          `pump-suffix present but detector null — null per R1 (mint=${address})`,
        );
      }
      return result;
    }
    const evm = EVM_CHAIN_ALIASES[normalized] ?? null;
    if (evm === null) return null;
    return this.detectEvm(evm, address);
  }

  private async detectSolana(mint: string): Promise<LaunchpadInfo | null> {
    let mintBytes: Uint8Array;
    try {
      mintBytes = addressToBytes(mint);
    } catch {
      return null;
    }
    let pumpPda: string;
    let launchlabWsol: string;
    let launchlabUsdc: string;
    let moonitCurve: string;
    let boopCurve: string;
    try {
      pumpPda = findProgramAddress(
        [utf8Seed('bonding-curve'), mintBytes],
        PUMP_FUN_PROGRAM,
      ).address;
      launchlabWsol = findProgramAddress(
        [utf8Seed('pool'), mintBytes, addressToBytes(WSOL_MINT)],
        RAYDIUM_LAUNCHLAB_PROGRAM,
      ).address;
      launchlabUsdc = findProgramAddress(
        [utf8Seed('pool'), mintBytes, addressToBytes(USDC_MINT)],
        RAYDIUM_LAUNCHLAB_PROGRAM,
      ).address;
      moonitCurve = findProgramAddress(
        [utf8Seed('token'), mintBytes],
        MOONIT_PROGRAM,
      ).address;
      boopCurve = findProgramAddress(
        [utf8Seed('bonding_curve'), mintBytes],
        BOOP_PROGRAM,
      ).address;
    } catch {
      return null;
    }
    const [batch, heaven] = await Promise.all([
      this.solanaRpc.getMultipleAccounts([
        pumpPda,
        launchlabWsol,
        launchlabUsdc,
        moonitCurve,
        boopCurve,
      ]),
      this.detectHeaven(mint),
    ]);
    if (batch !== null) {
      const [pump, wsol, usdc] = batch;
      if (pump !== null && pump !== undefined) {
        return launchpadInfo('pump-fun', 'solana', mint);
      }
      const pools = [wsol, usdc].filter(
        (entry) => entry !== null && entry !== undefined,
      );
      for (const pool of pools) {
        const brand = this.launchlabBrand(pool?.data?.[0] ?? '');
        if (brand !== null) {
          return launchpadInfo(brand, 'solana', mint);
        }
      }
      if (pools.length > 0) {
        return launchpadInfo('raydium-launchlab', 'solana', mint);
      }
      const moonit = batch[3];
      if (moonit !== null && moonit !== undefined) {
        return launchpadInfo('moonit', 'solana', mint);
      }
      const boop = batch[4];
      if (boop !== null && boop !== undefined) {
        return launchpadInfo('boop', 'solana', mint);
      }
    }
    if (heaven) {
      return launchpadInfo('heaven', 'solana', mint);
    }
    // LAST resort (todo 36): archival Helius history leg — ONLY after
    // the fast legs (PDA batch + heaven) all miss (closed/absent
    // curves on graduated-old tokens). Fast hits return above with
    // ZERO Helius calls (spec-pinned via spy).
    return this.detectHeliusOrigin(mint);
  }

  private launchlabBrand(poolDataBase64: string): string | null {
    if (poolDataBase64 === '') return null;
    let raw: Uint8Array;
    try {
      raw = Uint8Array.from(Buffer.from(poolDataBase64, 'base64'));
    } catch {
      return null;
    }
    for (const config of BONKFUN_PLATFORM_CONFIGS) {
      try {
        if (containsBytes(raw, addressToBytes(config))) return 'bonk-fun';
      } catch {
        continue;
      }
    }
    for (const config of STONKFUN_PLATFORM_CONFIGS) {
      try {
        if (containsBytes(raw, addressToBytes(config))) return 'stonkfun';
      } catch {
        continue;
      }
    }
    return null;
  }

  private async detectHeaven(mint: string): Promise<boolean> {
    try {
      const { data } = await axios.post(
        HEAVEN_POOL_STATE_URL,
        { program_id: HEAVEN_PROGRAM, mint },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: HTTP_TIMEOUT_MS,
        },
      );
      const body = data as { data?: unknown };
      return (
        data !== null &&
        typeof data === 'object' &&
        typeof body.data === 'string' &&
        body.data.length > 0
      );
    } catch {
      return false;
    }
  }

  private async detectEvm(
    chain: string,
    address: string,
  ): Promise<LaunchpadInfo | null> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
    // Shared slow-phase deadline (parallel follow-up): ONE wall-clock
    // instant (start + slowLegMs). Each network-bound leg gets its OWN
    // AbortController cut at that instant — no leg outlives the budget,
    // and the brand-API legs overlap (total ~= max, not sum) so the
    // ~1.6s bankr miss + ~1.3s Pons SSR fit the ~2s default together.
    const deadlineAt = Date.now() + this.slowLegMs;
    const armLeg = (): { signal: AbortSignal; done: () => void } => {
      const controller = new AbortController();
      const remaining = deadlineAt - Date.now();
      const timer = setTimeout(
        () => controller.abort(),
        Math.max(remaining, 0),
      );
      return {
        signal: controller.signal,
        done: (): void => clearTimeout(timer),
      };
    };
    // Phase 1 — brand-API legs CONCURRENTLY via Promise.allSettled (one
    // outage never blocks the others). Chain gates preserved: bankr
    // only on BANKR_CHAINS, Pons only on PONS_CHAINS (a skipped leg
    // resolves false WITHOUT any fetch, as before).
    const bankrLeg = armLeg();
    const mintclubLeg = armLeg();
    const ponsLeg = armLeg();
    try {
      const settled = await Promise.allSettled([
        BANKR_CHAINS.has(chain)
          ? this.detectBankr(address, bankrLeg.signal)
          : Promise.resolve(false),
        this.detectMintclub(chain, address, mintclubLeg.signal),
        PONS_CHAINS.has(chain)
          ? this.detectPonsCached(chain, address, ponsLeg.signal)
          : Promise.resolve(false),
      ] as const);
      // Precedence by POSITION, not finish order (specific-before-
      // generic, unchanged): a slower bankr hit still beats a faster
      // Pons hit. Rejections fail open (skipped — all-fail is null).
      if (settled[0].status === 'fulfilled' && settled[0].value === true) {
        return launchpadInfo('bankr', chain, address);
      }
      if (settled[1].status === 'fulfilled' && settled[1].value !== null) {
        return settled[1].value;
      }
      if (settled[2].status === 'fulfilled' && settled[2].value === true) {
        return launchpadInfo('pons', chain, address);
      }
    } finally {
      bankrLeg.done();
      mintclubLeg.done();
      ponsLeg.done();
    }
    // Phase 2 — generic-infra fallback (fix 5: ONE Alchemy creation
    // lookup + ONE receipt vs the factory table) ONLY on API all-miss.
    // Deferred — never concurrent with Phase 1 — so the pinned shapes
    // hold: a bankr/Pons hit short-circuits with ZERO extra fetches,
    // and the same shared deadline still bounds it (remaining budget
    // only).
    //
    // The retired Blockscout `getcontractcreation` leg (bnb/bsc
    // answered HTTP 404) is replaced by Alchemy `getAssetTransfers`
    // (first ERC-20 transfer ascending = creation tx). The receipt
    // `to` factory match REMAINS the mandatory gate: a token is Flap
    // only when its creation receipt targets the Flap Portal (CREATE2
    // deployer shape). Receipt `to` absent or the hash unavailable is
    // TRANSIENT (`unavailable`) and never negative-cached.
    //
    // NEGATIVE CACHE (fix 5): an explicit non-Flap factory receipt is
    // negative-cached for ~15 min (`flap:factory-mismatch:` key,
    // separate from the 14-day positive row). A negative HIT skips
    // the Alchemy lookup for that scan but MUST NOT suppress the
    // keyless paths (flapsh + page), so the token can still be
    // corroborated. A FRESH mismatch never reaches the page (weaker
    // evidence cannot overturn the explicit receipt), while a
    // transient/unavailable verdict does.
    //
    // FLAPSH CORROBORATION (todo 60, research 57 — bsc-gated): ONE
    // keyless DSC pair-list read (`/latest/dex/tokens/<mint>`, the
    // existing DexScreenerService seam + an AbortSignal cut at the
    // SAME shared deadline) runs CONCURRENTLY with the factory leg —
    // latency ~= max, not sum — and is consulted ONLY after every
    // detector positive missed. A pair with `dexId: 'flapsh'` then
    // upgrades the null to `flap` (platform-Flap corroboration,
    // caveat e); its ABSENCE stays an honest null and is NEVER
    // negative evidence (caveat a). Positive corroborations ride the
    // flap positive cache below; nulls are never cached (19a).
    //
    // KEYLESS PAGE FALLBACK (fix 5, BSC only): `flap.sh/bnb/<token>`
    // is read ONLY when the Alchemy-hash/receipt path is unavailable
    // (missing key, 429, empty, throw, or a missing receipt). The page
    // never supplies a tx hash and never overrides an explicit
    // `receiptTo` mismatch. Positive = HTTP 200 + a `| FLAP` title +
    // the RSC `"createdAt":<unix>` marker; everything else (generic
    // `Flap — The Programmable Token Launchpad` shell, title-only,
    // timeout, throw) is negative. ~2.5s own budget.
    const factoryLeg = armLeg();
    const flapshLeg = FLAPSH_CORROBORATION_CHAINS.has(chain) ? armLeg() : null;
    try {
      if (await this.getCachedFlap(chain, address)) {
        this.logger.debug(`flap-cache hit (chain=${chain}) — receipt skipped`);
        return launchpadInfo('flap', chain, address);
      }
      const mismatchCached = await this.getCachedFlapMismatch(chain, address);
      if (mismatchCached) {
        this.logger.debug(
          `flap factory-mismatch cache hit (chain=${chain}) — Alchemy skipped`,
        );
      }
      const settled = await Promise.allSettled([
        mismatchCached
          ? Promise.resolve(FACTORY_UNAVAILABLE)
          : this.resolveFactoryVerdict(chain, address, factoryLeg.signal),
        flapshLeg !== null
          ? this.detectFlapshPair(chain, address, flapshLeg.signal)
          : Promise.resolve(false),
      ] as const);
      const verdict: FactoryVerdict =
        settled[0].status === 'fulfilled'
          ? settled[0].value
          : FACTORY_UNAVAILABLE;
      if (verdict.kind === 'match') {
        if (verdict.id === 'flap') {
          await this.putCachedFlap(chain, address);
        }
        return launchpadInfo(verdict.id, chain, address);
      }
      if (settled[1].status === 'fulfilled' && settled[1].value === true) {
        this.logger.debug(
          `flapsh-pair corroborated (chain=${chain}) — factory miss upgraded`,
        );
        await this.putCachedFlap(chain, address);
        return launchpadInfo('flap', chain, address);
      }
      if (verdict.kind === 'mismatch') {
        await this.putCachedFlapMismatch(chain, address);
        return null;
      }
      if (await this.detectFlapPage(chain, address)) {
        this.logger.debug(
          `flap page corroborated (chain=${chain}) — factory unavailable`,
        );
        await this.putCachedFlap(chain, address);
        return launchpadInfo('flap', chain, address);
      }
      return null;
    } finally {
      factoryLeg.done();
      flapshLeg?.done();
    }
  }

  /**
   * flapsh-pair corroboration leg (dexter plan todo 60, from research
   * 57): read the token's DexScreener pair LIST cross-chain
   * (`/latest/dex/tokens/<mint>` — the same endpoint the research
   * probed) and corroborate ONLY on the exact `dexId: 'flapsh'` of a
   * pair on the SAME chain (`chainId === <our slug>`, belt +
   * suspenders: cross-chain rows never corroborate a chain's card).
   * The list read includes pairs where the token sits on the QUOTE
   * side — stock-paired launches quote the token (caveat d) — so NO
   * `baseToken.address == mint` check exists by design. Fail-open
   * `false` on EVERY ambiguity: DSC service absent (hand-built
   * specs), unmapped slug, transport failure, abort over the shared
   * deadline. `false`/absence is NEVER negative evidence (caveat a:
   * Flap tokens without a flapsh pair exist — null stays honest).
   */
  private async detectFlapshPair(
    chain: string,
    address: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const dexscreener = this.dexscreener;
    if (dexscreener === null || dexscreener === undefined) return false;
    const slug = resolveDexScreenerSlug(chain);
    if (slug === null) return false;
    try {
      const pairs = await dexscreener.getPairsByToken(address, signal);
      if (pairs === null || pairs === undefined) return false;
      return pairs.some(
        (pair) => pair.dexId === 'flapsh' && pair.chainId === slug,
      );
    } catch {
      return false;
    }
  }

  private async detectBankr(
    address: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      const { status, data } = await axios.get(
        `${BANKR_API_BASE}/public/doppler/token-fees/${address}`,
        { timeout: HTTP_TIMEOUT_MS, validateStatus: () => true, signal },
      );
      if (status !== 200 || data === null || data === undefined) return false;
      return JSON.stringify(data).toLowerCase().includes(address.toLowerCase());
    } catch {
      return false;
    }
  }

  private async detectMintclub(
    chain: string,
    address: string,
    signal?: AbortSignal,
  ): Promise<LaunchpadInfo | null> {
    const numeric = MINTCLUB_NUMERIC_CHAIN[chain] ?? null;
    if (numeric === null) return null;
    try {
      const { status, data } = await axios.get(
        `${MINTCLUB_API_BASE}/api/tokens/byAddress/${numeric}/${address}`,
        { timeout: HTTP_TIMEOUT_MS, validateStatus: () => true, signal },
      );
      if (status !== 200 || data === null || typeof data !== 'object') {
        return null;
      }
      const record = data as { address?: unknown; symbol?: unknown };
      if (
        typeof record.address !== 'string' ||
        record.address.toLowerCase() !== address.toLowerCase()
      ) {
        return null;
      }
      if (typeof record.symbol === 'string' && record.symbol !== '') {
        return {
          id: 'mintclub',
          name: 'Mint Club',
          url: `${MINTCLUB_API_BASE}/token/${chain}/${record.symbol}`,
        };
      }
      return launchpadInfo('mintclub', chain, address);
    } catch {
      return null;
    }
  }

  /**
   * Pons SSR registry leg (plan todos 26/34): `GET <base>/launchpad/<address>`
   * is server-rendered — a Pons-launched token answers a token-specific
   * `<title>NAME (SYM) | Pons</title>` with an indexing robots tag
   * (`index, follow`), while unknown addresses get the generic shell
   * `<title>Token | Pons</title>` with `noindex, nofollow` (verified live
   * 2026-10-10: NYMA 0x968B… vs 0x…dead). Both conditions must hold
   * (token-specific title + indexable robots), so a site redesign fails
   * open to null instead of false-positive. NOTE 2026-10-10: the todo-26
   * shape (`· pons` suffix + canonical link) is retired — the redesign
   * answers `| Pons` titles on BOTH pages and ships a canonical carrying
   * the address even on the generic shell, so neither discriminates now.
   * Keyless, single GET, robinhood-scoped by the caller.
   *
   * BOUND (plan todo 35 + parallel follow-up): the fetch runs under an
   * AbortController cut at `slowLegMs` (~2s default — the SSR leg
   * measures ~1.3s live, so it fits with headroom when run CONCURRENT
   * with the ~1.6s bankr miss: max, not sum). When the detector runs
   * the slow legs concurrently it passes its per-leg signal in (same
   * shared wall-clock deadline — no second timer); standalone callers
   * get the own-timer path below. Over the deadline the request aborts
   * and the leg fails open to null — it NEVER hangs the card. The
   * axios `timeout` below stays as an outer backstop only; the abort
   * is the operative bound.
   */
  private async detectPons(
    address: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (signal !== undefined) {
      return this.fetchPonsPage(address, signal);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.slowLegMs);
    try {
      return await this.fetchPonsPage(address, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchPonsPage(
    address: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    try {
      const { status, data } = await axios.get(
        `${PONS_LAUNCHPAD_BASE}/launchpad/${address}`,
        {
          timeout: HTTP_TIMEOUT_MS,
          validateStatus: () => true,
          signal,
        },
      );
      if (status !== 200 || typeof data !== 'string') return false;
      const title = /<title>([^<]*)<\/title>/i.exec(data)?.[1]?.trim() ?? '';
      if (!/\| Pons$/.test(title) || title === 'Token | Pons') {
        return false;
      }
      // Robots-index guard: launched tokens are indexed, the generic
      // shell is noindex — a second independent signal so a title-only
      // coincidence cannot false-positive.
      const robots =
        /<meta[^>]*name=["']robots["'][^>]*>/i.exec(data)?.[0] ?? '';
      const content = /content=["']([^"']*)["']/i.exec(robots)?.[1] ?? '';
      if (content === '' || /noindex/i.test(content)) return false;
      return /\bindex\b/i.test(content);
    } catch {
      // Abort (over-deadline), transport failure, non-string body:
      // all fail open to null — never throws outward.
      return false;
    }
  }

  /**
   * Pons cached wrapper (plan todo 35): positive `pons` resolutions are
   * cached on the shared CacheService (the EXISTING cache primitive —
   * in-memory TTL map today, Redis via the same port when it lands;
   * NO new table: origin is immutable per mint so no tripwire schema
   * is needed, unlike the discovery cache's dexId-verified rows).
   * Cache ABSENT (hand-built specs, partial DI) → straight to SSR,
   * byte-identical to pre-cache behavior. Nulls are NEVER written
   * (19a no-negative-cache); a cache write failure is swallowed
   * (fail-open — the SSR answer still returns).
   */
  private async detectPonsCached(
    chain: string,
    address: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (this.ponsCache === null || this.ponsCache === undefined) {
      return this.detectPons(address, signal);
    }
    const key = ponsCacheKey(chain, address);
    try {
      if ((await this.ponsCache.get<boolean>(key)) === true) {
        this.logger.debug(`pons-cache hit (chain=${chain}) — SSR skipped`);
        return true;
      }
    } catch {
      // Cache read failure → probe SSR (fail-open, never throws).
    }
    const launched = await this.detectPons(address, signal);
    if (launched) {
      try {
        await this.ponsCache.set(key, true, this.ponsTtlSeconds);
      } catch {
        // Cache write failure → answer still returns (fail-open).
      }
    }
    return launched;
  }

  // Flap positive-cache primitives (dexter plan todo 44): same
  // fail-open shape as the Pons wrapper above — cache ABSENT →
  // miss (caller runs the receipt path), read/write failures
  // swallowed. Nulls are NEVER written by construction (only the
  // `factory === 'flap'` branch calls `putCachedFlap`).
  private async getCachedFlap(
    chain: string,
    address: string,
  ): Promise<boolean> {
    if (this.ponsCache === null || this.ponsCache === undefined) {
      return false;
    }
    try {
      return (
        (await this.ponsCache.get<boolean>(flapCacheKey(chain, address))) ===
        true
      );
    } catch {
      return false;
    }
  }

  private async putCachedFlap(chain: string, address: string): Promise<void> {
    if (this.ponsCache === null || this.ponsCache === undefined) return;
    try {
      await this.ponsCache.set(
        flapCacheKey(chain, address),
        true,
        this.flapTtlSeconds,
      );
    } catch {
      // Cache write failure → answer still returns (fail-open).
    }
  }

  // Flap factory-mismatch negative cache (fix 5): same shared
  // CacheService primitive, SEPARATE namespace + ~15 min TTL. Only an
  // explicit non-Flap receipt writes it; transient Alchemy gaps never
  // do. A read hit skips the Alchemy lookup but never the keyless
  // flapsh/page paths. Fail-open on absent cache or read/write errors.
  private async getCachedFlapMismatch(
    chain: string,
    address: string,
  ): Promise<boolean> {
    if (this.ponsCache === null || this.ponsCache === undefined) {
      return false;
    }
    try {
      return (
        (await this.ponsCache.get<boolean>(
          flapFactoryMismatchCacheKey(chain, address),
        )) === true
      );
    } catch {
      return false;
    }
  }

  private async putCachedFlapMismatch(
    chain: string,
    address: string,
  ): Promise<void> {
    if (this.ponsCache === null || this.ponsCache === undefined) return;
    // CacheService TTL is seconds; the contract above is ms-based —
    // round UP so a sub-second override never becomes a zero-TTL row.
    const ttlSeconds = Math.max(1, Math.ceil(this.flapMismatchTtlMs / 1000));
    try {
      await this.ponsCache.set(
        flapFactoryMismatchCacheKey(chain, address),
        true,
        ttlSeconds,
      );
    } catch {
      // Cache write failure → answer still returns (fail-open).
    }
  }

  /**
   * Helius history origin leg (todo 36, Solana LAST resort): for
   * mints with no live curve (graduated-old, account closed) the
   * PDA batch + heaven both miss, so resolve origin from on-chain
   * HISTORY via the Helius seam (`helius.service.ts:180-218` —
   * `getAddressHistory` + `parseTransaction`; NO raw
   * `getSignaturesForAddress` — the seam proves sufficient).
   * Sequence: ONE history pull → slot-ascending earliest → ONE
   * full-tx fetch for that signature only → pure
   * `mapHeliusOriginToLaunchpad` actor table → `launchpadInfo`.
   * Fail-open null on EVERY ambiguity (no Helius DI, empty
   * history, missing signature, parse null, unknown actor,
   * timeout, 429 — zero retries in-leg). Live history items may
   * lack actor fields (INCOME 2026-10-10: `signer` undefined) —
   * only `signature`/`slot` are read from them; actors come from
   * the full tx alone.
   */
  private async detectHeliusOrigin(
    mint: string,
  ): Promise<LaunchpadInfo | null> {
    const helius = this.helius;
    if (helius === null || helius === undefined) return null;
    try {
      const work = (async (): Promise<LaunchpadInfo | null> => {
        const history = await helius.getAddressHistory(
          mint,
          HELIUS_ORIGIN_HISTORY_LIMIT,
        );
        if (history === null || history === undefined || history.length === 0) {
          return null;
        }
        let earliestSlot = Number.POSITIVE_INFINITY;
        let earliestSig: string | null = null;
        for (const tx of history) {
          const slot =
            typeof tx?.slot === 'number' ? tx.slot : Number.POSITIVE_INFINITY;
          const sig = typeof tx?.signature === 'string' ? tx.signature : '';
          if (sig !== '' && slot < earliestSlot) {
            earliestSlot = slot;
            earliestSig = sig;
          }
        }
        if (earliestSig === null) return null;
        const full = await helius.parseTransaction(earliestSig);
        if (full === null || full === undefined) return null;
        const id = mapHeliusOriginToLaunchpad(full);
        if (id === null) return null;
        return launchpadInfo(id, 'solana', mint);
      })();
      return await withTimeout(work, this.heliusOriginMs);
    } catch {
      return null;
    }
  }

  /**
   * Phase-2 factory verdict (fix 5): Alchemy creation hash → receipt
   * `to` (the mandatory factory gate).
   *
   * - `unavailable` — no transport/no Alchemy DI/no creation hash/no
   *   receipt `to`. TRANSIENT: never negative-cached; the keyless page
   *   fallback may still corroborate on BSC.
   * - `match` — receipt `to` equals a factory in `RECEIPT_MATCH_ORDER`
   *   (positional precedence preserved).
   * - `mismatch` — the receipt WAS read and names another factory
   *   (explicit negative evidence; ~15 min negative cache).
   *
   * `receiptTo` keeps its own contract/validation untouched: a
   * `to: null` receipt is treated as `unavailable`, NOT as a mismatch
   * (pinksale-style contract-creation receipts must stay eligible for
   * future keyless legs).
   */
  private async resolveFactoryVerdict(
    chain: string,
    address: string,
    signal?: AbortSignal,
  ): Promise<FactoryVerdict> {
    const transport = EVM_CHAIN_TRANSPORTS[chain] ?? null;
    if (transport === null) return FACTORY_UNAVAILABLE;
    const txHash = await this.creationTxHash(chain, address, signal);
    if (txHash === null) return FACTORY_UNAVAILABLE;
    const to = await this.receiptTo(transport.rpcUrl, txHash, signal);
    if (to === null) return FACTORY_UNAVAILABLE;
    for (const id of RECEIPT_MATCH_ORDER) {
      const set = EVM_FACTORY_SETS[id] ?? null;
      if (set === null) continue;
      if (!set.chains.includes(chain)) continue;
      if (set.factories.some((factory) => factory.toLowerCase() === to)) {
        return { kind: 'match', id };
      }
    }
    return { kind: 'mismatch' };
  }

  /**
   * Creation-tx hash via Alchemy `getAssetTransfers` (fix 5): the
   * first ERC-20 transfer touching the token, ascending from genesis.
   * The retired Blockscout `getcontractcreation` call is gone —
   * bnb/bsc Blockscout answer HTTP 404 and Etherscan free excludes
   * BSC (research 49). Absent DI / absent key / 429 / empty / thrown
   * errors resolve `null` (transient, never negative-cached): the
   * detector never throws outward.
   */
  private async creationTxHash(
    chain: string,
    address: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const alchemy = this.alchemy;
    if (alchemy === null || alchemy === undefined) return null;
    try {
      const hash = await alchemy.getAssetTransfers(chain, address, {
        signal,
      });
      if (typeof hash !== 'string') return null;
      return /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash : null;
    } catch {
      return null;
    }
  }

  /**
   * Keyless Flap page fallback (fix 5, BSC ONLY): `flap.sh/bnb/<token>`.
   *
   * Phase A proved a bare 200 is NOT proof (the page is a JS shell on
   * launched AND dead addresses), so a positive requires BOTH:
   *  1. a token-specific `<title>… | FLAP</title>` (the generic
   *     `Flap — The Programmable Token Launchpad` shell is negative),
   *  2. the RSC payload carrying `"createdAt":<unix>` (escaped or
   *     plain).
   * Everything else — generic title, title-only, non-200, non-string
   * body, transport error, own ~2.5s abort — is negative. The page
   * NEVER supplies a tx hash and NEVER overrides an explicit
   * `receiptTo` mismatch (the caller only reaches it on an
   * `unavailable` verdict). Same `LaunchpadInfo` shape/id/name/url as
   * the factory path (built by `launchpadInfo`).
   */
  private async detectFlapPage(
    chain: string,
    address: string,
  ): Promise<boolean> {
    if (chain !== 'bsc') return false;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      FLAP_PAGE_TIMEOUT_MS_DEFAULT,
    );
    try {
      const { status, data } = await axios.get(
        `https://flap.sh/bnb/${address}`,
        {
          timeout: HTTP_TIMEOUT_MS,
          validateStatus: () => true,
          signal: controller.signal,
        },
      );
      if (status !== 200 || typeof data !== 'string') return false;
      const title = /<title>([^<]*)<\/title>/i.exec(data)?.[1]?.trim() ?? '';
      if (!/\|\s*FLAP\s*$/i.test(title)) return false;
      // RSC flight payloads carry the key escaped (`\"createdAt\":…`)
      // inside the `self.__next_f.push` string; accept the escaped and
      // plain forms, never a title-only coincidence.
      return /\\?"createdAt\\?"\s*:\s*\d+/.test(data);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async receiptTo(
    rpcUrl: string,
    txHash: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    try {
      const { status, data } = await axios.post(
        rpcUrl,
        {
          jsonrpc: '2.0',
          id: 'launchpad-detector',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: HTTP_TIMEOUT_MS,
          validateStatus: () => true,
          signal,
        },
      );
      if (status !== 200 || data === null || typeof data !== 'object') {
        return null;
      }
      const result = (data as { result?: unknown }).result as {
        to?: unknown;
      } | null;
      if (result === null || typeof result.to !== 'string') return null;
      return result.to.toLowerCase();
    } catch {
      return null;
    }
  }
}
