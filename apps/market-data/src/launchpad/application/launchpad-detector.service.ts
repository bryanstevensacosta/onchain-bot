import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import axios from 'axios';
import { CacheService } from 'cache/application/cache.service';
import { SolanaRpcService } from 'provider/infrastructure/solana-rpc/solana-rpc.service';
import type { LaunchpadInfo } from '../domain/launchpad-info';
import type { LaunchpadDetectorPort } from '../domain/launchpad-detector.port';
import {
  BANKR_API_BASE,
  BONKFUN_PLATFORM_CONFIGS,
  BOOP_PROGRAM,
  EVM_CHAIN_TRANSPORTS,
  EVM_FACTORY_SETS,
  EVM_LAUNCHPAD_ORDER,
  EVM_RECEIPT_EXCLUDED,
  HEAVEN_POOL_STATE_URL,
  HEAVEN_PROGRAM,
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

const RECEIPT_MATCH_ORDER = EVM_LAUNCHPAD_ORDER.filter(
  (id) => !(id in EVM_RECEIPT_EXCLUDED),
);

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
 * Blockscout creation lookup + ONE receipt fetch ONLY on API
 * all-miss (a Pons hit never consults the factory receipt).
 * Every external call carries a timeout; anything unknown, slow, or
 * failed resolves to `null` — this service never throws outward.
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

  public constructor(
    private readonly solanaRpc: SolanaRpcService,
    @Optional()
    @Inject(CacheService)
    private readonly ponsCache: CacheService | null = null,
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
      return this.detectSolana(address);
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
    return null;
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
    // Phase 2 — generic-infra fallback (ONE Blockscout creation + ONE
    // receipt vs the factory table) ONLY on API all-miss. Deferred —
    // never concurrent with Phase 1 — so the pinned shapes hold: a
    // bankr/Pons hit short-circuits with ZERO extra fetches, and the
    // same shared deadline still bounds it (remaining budget only).
    const factoryLeg = armLeg();
    try {
      const factory = await this.detectFactoryTo(
        chain,
        address,
        factoryLeg.signal,
      );
      if (factory === null) return null;
      return launchpadInfo(factory, chain, address);
    } finally {
      factoryLeg.done();
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

  private async detectFactoryTo(
    chain: string,
    address: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const transport = EVM_CHAIN_TRANSPORTS[chain] ?? null;
    if (transport === null || transport.blockscoutUrl === null) return null;
    const txHash = await this.creationTxHash(
      transport.blockscoutUrl,
      address,
      signal,
    );
    if (txHash === null) return null;
    const to = await this.receiptTo(transport.rpcUrl, txHash, signal);
    if (to === null) return null;
    for (const id of RECEIPT_MATCH_ORDER) {
      const set = EVM_FACTORY_SETS[id] ?? null;
      if (set === null) continue;
      if (!set.chains.includes(chain)) continue;
      if (set.factories.some((factory) => factory.toLowerCase() === to)) {
        return id;
      }
    }
    return null;
  }

  private async creationTxHash(
    blockscoutUrl: string,
    address: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    try {
      const { status, data } = await axios.get(blockscoutUrl + '/api', {
        params: {
          module: 'contract',
          action: 'getcontractcreation',
          contractaddresses: address,
        },
        timeout: HTTP_TIMEOUT_MS,
        validateStatus: () => true,
        signal,
      });
      if (status !== 200 || data === null || typeof data !== 'object') {
        return null;
      }
      const result = (data as { result?: unknown }).result;
      if (!Array.isArray(result) || result.length === 0) return null;
      const entry = result[0] as {
        contractAddress?: unknown;
        txHash?: unknown;
      };
      if (
        typeof entry.contractAddress !== 'string' ||
        entry.contractAddress.toLowerCase() !== address.toLowerCase() ||
        typeof entry.txHash !== 'string' ||
        entry.txHash === ''
      ) {
        return null;
      }
      return entry.txHash;
    } catch {
      return null;
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
