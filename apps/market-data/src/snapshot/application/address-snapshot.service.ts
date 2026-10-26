import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { ProviderRegistryService } from 'provider/application/provider-registry.service';
import { CacheService } from 'cache/application/cache.service';
import { RateLimiterPort } from 'rate-limiter/domain/rate-limiter.port';
import { resolveProviderOutboundBudget } from 'rate-limiter/domain/provider-outbound-limits';
import { AddressIdVo } from 'address/domain/address-id.vo';
import { AddressKindDetectorService } from 'address/application/address-kind-detector.service';
import {
  AddressSnapshot,
  AddressSnapshotInput,
} from '../domain/snapshot.types';
import {
  SNAPSHOT_CACHE_TTL_SECONDS,
  SNAPSHOT_PROVIDER_TIMEOUT_MS,
  SNAPSHOT_QUOTE_PROVIDERS,
  SNAPSHOT_QUOTE_FIELDS,
  emptySnapshotQuote,
  resolveStaleMaxAgeMs,
  type QuoteFetcher,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import type { AggregationOutcome } from 'aggregators/application/snapshot-aggregator.service';
import { AggregationPolicyPort } from 'aggregators/domain/aggregation-policy.port';
import {
  DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT,
  LaunchpadDetectorService,
  resolveDetectorSlowLegTimeoutMs,
} from 'launchpad/application/launchpad-detector.service';
import type { LaunchpadInfo } from 'launchpad/domain/launchpad-info';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { BIRDEYE_SUPPORTED_CHAINS } from 'provider/infrastructure/birdeye/birdeye.service';
import {
  GECKO_NETWORK_SLUGS,
  GECKO_SUPPORTED_CHAINS,
} from 'provider/infrastructure/quote-fetchers/provider-quote.fetchers';
import { selectPoolQuote } from 'provider/infrastructure/geckoterminal';
import { toVenueOrNull, type SnapshotVenue } from '../domain/snapshot-venue';
import {
  applyVenueMarketFields,
  type VenueMarketReading,
} from '../domain/snapshot-venue-market';
import { RetryableProviderError } from 'provider/domain/retryable-provider.error';
import { launchpadInfo } from 'launchpad/domain/launchpad-table';
import {
  deriveChange24hFromOhlcv,
  OHLC_CHANGE_PAST_TOLERANCE_MS,
  OHLC_CHANGE_WINDOW_MS,
  type OhlcvCandle,
} from '../domain/snapshot-ohlcv-change';
import {
  buildOhlcvSeedRows,
  deriveOutrightVsLiveChange,
  OHLC_BACKFILL_SOURCE,
  OHLC_BACKFILL_SOURCE_BIRDEYE,
  OHLC_BACKFILL_WINDOW_MS,
} from '../domain/snapshot-ohlcv-backfill';
import {
  AthSeedNegativeMemo,
  AthSeedTransientBackoff,
  buildFdvAthSeedRow,
  resolveAthSeedDays,
  resolveAthSeedEnabled,
  SNAPSHOT_ATH_SEED_TIMEOUT_MS,
} from '../domain/snapshot-ath-seed';
import {
  applyComputedFdv,
  computedFdvEpsilonBound,
} from '../domain/snapshot-computed-fdv';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import {
  deriveSnapshotNullReason,
  SnapshotNullMetricsService,
} from './snapshot-null-metrics.service';
import { applyOutboundRateLimit } from 'provider/infrastructure/quote-fetchers/rate-limited-fetchers';
import { applySingleRetryFetchers } from 'provider/infrastructure/quote-fetchers/fetcher-retry';
import { DevHoldingsPort } from '../../holders/domain/holdings.port';
import { AssetResolverService } from 'asset-registry/application/asset-resolver.service';
import { CircuitBreakerService } from 'shared/infrastructure/rate-limiter/application/circuit-breaker.service';
import { snapshotBreakerKey } from 'shared/infrastructure/rate-limiter/domain/snapshot-breaker-key';
import {
  DIRECT_FAST_PATH_DEADLINE_MS,
  DirectFastPathService,
} from './direct-fast-path.service';
import {
  selectPreferredQuote,
  TOLERANCE_DEFAULT_BPS,
} from 'provider/infrastructure/onchain/evm-tolerance';
import { DiscoveryCacheService } from './discovery-cache.service';
import { OnchainSolanaReaderService } from 'provider/infrastructure/onchain/onchain-solana.reader';
import { GoplusService } from 'provider/infrastructure/goplus';
import { SingleflightService } from './singleflight.service';
import {
  QuotaGovernorService,
  quotaGovernorTierOf,
  type QuotaGovernorTier,
} from './quota-governor.service';
import {
  isStaleTrioValid,
  isTailDegraded,
} from '../domain/snapshot-ttl-policy';
import {
  agingEscalationNote,
  resolveFanoutDeadlineMs,
  SNAPSHOT_SWR_MIN_AGE_MS,
  swrNowNote,
} from '../domain/snapshot-latency';
import {
  goplusChainId,
  HONEYPOT_TRANSIENT_NOTE,
  HoneypotNegativeMemo,
  resolveHoneypotEnabled,
  resolveHoneypotTimeoutMs,
  resolveSimVerdictEnabled,
  type HoneypotProbe,
  type HoneypotReading,
  type LpLockReading,
} from '../domain/snapshot-honeypot';
import {
  AddressExistenceService,
  type ExistenceProbeResult,
} from './address-existence.service';
import { PendingAgingService } from './pending-aging.service';
import type { SnapshotHistoryRow } from '../infrastructure/snapshot-history.repository';
import type { SnapshotFdvAth } from '../domain/snapshot-fdv-ath';

/** Log helper: nullable ms renders as `n/a` (never crashes the line). */
const roundMs = (ms: number | null): string =>
  ms === null ? 'n/a' : String(Math.round(ms));

/**
 * Raw epoch ms → ISO for `AddressSnapshot.pairCreatedAt` (dexter
 * plan todo 63). Single conversion seam: the tail (`resolveVenue`,
 * hit and miss) and the fast-path handoff both carry RAW ms; this
 * helper is the only ms→ISO step. Guards: a non-number (absent on
 * legacy hand-mocks/summaries), non-finite or `<= 0` value resolves
 * `null`; an ISO-invalid magnitude (finite but outside the Date
 * range) also resolves `null` — never an `Invalid Date` throw.
 */
export function toIsoPairCreatedAt(ms: unknown): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
  const at = new Date(ms);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * Trimmed-or-null string guard for the ATH-seed plumbing (dexter plan
 * todo 68): a blank/absent pool address resolves `null` (the seed then
 * skips with zero calls), never an empty-string key.
 */
export function nonEmptyTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Which side of a DexScreener best pair OUR address sits on (dexter
 * plan todo 68): compares the summary's base/quote token addresses
 * case-insensitively and resolves `null` when neither matches (the
 * discovery selection side-checks already, todo 20 — this is the
 * plumbing tail, not a second validation layer).
 */
export function dexscreenerPoolSide(
  baseTokenAddress: unknown,
  quoteTokenAddress: unknown,
  address: string,
): 'base' | 'quote' | null {
  const wanted = (address ?? '').trim().toLowerCase();
  if (wanted === '') return null;
  const base = nonEmptyTrimmed(baseTokenAddress)?.toLowerCase();
  if (base === wanted) return 'base';
  const quote = nonEmptyTrimmed(quoteTokenAddress)?.toLowerCase();
  if (quote === wanted) return 'quote';
  return null;
}

/**
 * GeckoTerminal launchpad hints the snapshot seam accepts (dexter plan
 * todo 72). A token `/info` `gt_category_ids` entry is NOT an origin
 * proof: the array order is not origin-first and its vocabulary overlaps
 * venues. The seam therefore accepts ONLY ids on this allowlist, ONLY
 * when the origin detector (tail) resolved nothing, and ONLY for
 * `solana` + `kind=token`. Grow this set one id at a time and only with
 * a fresh live probe of that launchpad — never derive an id from a mint
 * suffix or a venue id.
 */
export const GECKO_HINT_LAUNCHPADS: ReadonlySet<string> = new Set(['pump-fun']);

/**
 * Snapshot-tail budgets (dexter plan todo 29 — the tail is the
 * launchpad/venue/dev extras that run AFTER the quote fan-out; the
 * 28 re-measurement attributes ~2.5-6s of cold p95 to this tail).
 */
export const SNAPSHOT_TAIL_CONCURRENCY = 3;
export const SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS = 400;
/**
 * Metadata-identity budget (dexter plan todo 39): the post-merge
 * last-resort Metaplex read runs ONLY when the merged quote names
 * nothing, so the healthy path pays zero. Own deadline, fail-open.
 */
export const METADATA_IDENTITY_BUDGET_MS = 2000;

/**
 * Detector-tail budget (dexter plan todo 35): the launchpad detector
 * is OUT of the 400ms extras budget — it rides its OWN deadline (the
 * same `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS` the detector's Pons SSR leg is
 * aborted by, default `DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT`). The
 * deadline only MATTERS when the detector runs long (slow legs after
 * fast-leg miss): a fast hit returns at its natural speed under EITHER
 * budget, so fast-path timing is unchanged. Venue/dev keep the 400ms
 * `SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS` intact (honeypot rides its own
 * `honeypotTailMs` since the todo-71 follow-up — default 1500).
 */
export const SNAPSHOT_TAIL_LAUNCHPAD_TIMEOUT_MS_DEFAULT =
  DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT;

// Breaker key namespace moved to
// `shared/infrastructure/rate-limiter/domain/snapshot-breaker-key.ts`
// (dexter plan todo 19b3): the registry failure relay and this gate
// share ONE definition (the registry cannot import this service —
// cycle). Re-exported here so existing spec imports keep working.
export { snapshotBreakerKey };

/**
 * Chunked parallel runner (todo 29: no p-limit-style helper exists in
 * this app — verified by grep, so this 10-line local IS the helper).
 * Runs at most `concurrency` tasks at once, preserves order, never
 * throws when the tasks themselves never throw (each tail task is
 * catch-all by construction).
 */
export async function runTailCapped<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  concurrency: number,
): Promise<Array<T>> {
  const results = new Array<T>(tasks.length);
  const cap = Math.max(1, Math.min(concurrency, tasks.length));
  for (let start = 0; start < tasks.length; start += cap) {
    const chunk = tasks.slice(start, start + cap);
    const settled = await Promise.allSettled(chunk.map((task) => task()));
    for (let i = 0; i < chunk.length; i += 1) {
      const outcome = settled[i];
      if (outcome.status === 'fulfilled') {
        results[start + i] = outcome.value;
      }
    }
  }
  return results;
}

const TAIL_TIMEOUT = Symbol('tail-timeout');

/**
 * Per-extra tail budget (todo 29): the extra resolves to its value or
 * to the timeout sentinel after `SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS` — the
 * card NEVER waits on an extra. The abandoned work keeps its own
 * (longer) internal timeout and is catch-all, so no unhandled
 * rejection and no lingering await: the race already observed it.
 */
function withTailBudget<T>(
  work: Promise<T>,
  ms: number = SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS,
): Promise<T | typeof TAIL_TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const guard = new Promise<typeof TAIL_TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TAIL_TIMEOUT), ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
  return Promise.race([work, guard]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}

/**
 * AddressSnapshotService (Tramo 3, P45; canonical home todo 12, P50;
 * live aggregation todo-3 gap).
 *
 * The absorbed token path: kind=token snapshots compose exactly what
 * the old token shell did (chain validation + supporting-provider
 * hints), now with a live parallel fan-out over the supporting
 * providers (first-non-null merge). Every other kind rides the same
 * shape — one snapshot per kind. Chain qualifier is mandatory: empty
 * chain throws, unknown chain 404s (never a silent null). `ready`
 * needs a single merged field; `pending` (all providers failed) names
 * every miss in `providerErrors`. Hot results are cached (30s TTL) and
 * every call persists one history row (P44). MANDATORY order
 * (todo 14, anti-ban): the cache is checked FIRST — a HIT returns
 * before any outbound budget is touched; the per-provider token
 * buckets gate fetchers ONLY on a miss. A denied bucket is an
 * explicit `providerErrors` entry, never a failed snapshot.
 */
@Injectable()
export class AddressSnapshotService {
  private readonly logger = new Logger(AddressSnapshotService.name);
  /**
   * Serve-stale bound (dexter plan todo 19b1): ready rows older than
   * this never replay. Env `SNAPSHOT_STALE_MAX_AGE_HOURS`, default
   * 24h (`SNAPSHOT_STALE_MAX_AGE_MS`). Read once at construction —
   * no per-request config lookup on the hot path.
   */
  private readonly staleMaxAgeMs: number = resolveStaleMaxAgeMs(
    process.env['SNAPSHOT_STALE_MAX_AGE_HOURS'],
  );

  /**
   * Launchpad-tail budget instance value (dexter plan todo 35 — same
   * env as the detector slow leg, single source of truth). Read once
   * at construction, like `staleMaxAgeMs` above.
   */
  private readonly launchpadTailMs: number = resolveDetectorSlowLegTimeoutMs(
    process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'],
  );

  /**
   * ATH-seed kill-switch + window (dexter plan todo 68): read ONCE at
   * construction (same pattern as `staleMaxAgeMs`). `SNAPSHOT_ATH_SEED_ENABLED`
   * defaults ENABLED (only an explicit false-ish token disables);
   * `SNAPSHOT_ATH_SEED_DAYS` defaults 90 (janitor retention) and is
   * capped at 180 (GT's keyless public window).
   */
  private readonly athSeedEnabled: boolean = resolveAthSeedEnabled(
    process.env['SNAPSHOT_ATH_SEED_ENABLED'],
  );
  private readonly athSeedDays: number = resolveAthSeedDays(
    process.env['SNAPSHOT_ATH_SEED_DAYS'],
  );
  /**
   * Bounded in-process negative memo (todo 68): DEFINITIVE absences
   * (`[]`/404/401/400 — the day leg answered null) suppress re-fires
   * for the pinned TTL; transient classes (429/5xx/timeout) are never
   * remembered and retry next request. Resets on deploy (documented).
   */
  private readonly athSeedNegativeMemo = new AthSeedNegativeMemo();
  /**
   * 60s throttle memo (plan todo 72, P1): a 429-flavoured seed attempt
   * is transient, so it never enters the 6h DEFINITIVE memo above —
   * but re-firing it on every snapshot during a Gecko wall burns the
   * card's one free quota unit. Separate map, separate TTL, same
   * bounded/FIFO mechanics; resets on deploy.
   */
  private readonly athSeedTransientBackoff = new AthSeedTransientBackoff();

  /**
   * Honeypot kill-switch (dexter plan todo 71): read ONCE at
   * construction (same pattern as `athSeedEnabled`). OFF ⇒ no call AND
   * no field (silence) — the leg is additive and fail-open, so
   * ENABLED is the default; only an explicit false-ish token disables.
   */
  private readonly honeypotEnabled: boolean = resolveHoneypotEnabled(
    process.env['SNAPSHOT_HONEYPOT_ENABLED'],
  );
  /**
   * Honeypot-tail budget (todo 71 follow-up, `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS`
   * precedent): the GoPlus leg is OUT of the shared 400ms extras budget
   * — its live RTT (~389-467ms) loses that race. Env
   * `SNAPSHOT_HONEYPOT_TIMEOUT_MS`, default 1500. Read once at
   * construction (same pattern as `launchpadTailMs`); venue/dev keep
   * the shared 400ms byte-identical.
   */
  private readonly honeypotTailMs: number = resolveHoneypotTimeoutMs(
    process.env['SNAPSHOT_HONEYPOT_TIMEOUT_MS'],
  );
  /**
   * SIM-verdict kill-switch (`rick-compact-card` D1): read ONCE at
   * construction (same pattern as `honeypotEnabled`). OFF ⇒ the
   * reading's `sim` is nulled at the `resolveHoneypot` seam — taxes
   * AND `lpLock` survive (only the third-party verdict is reversible
   * without a deploy).
   */
  private readonly simVerdictEnabled: boolean = resolveSimVerdictEnabled(
    process.env['SNAPSHOT_SIM_VERDICT_ENABLED'],
  );
  /**
   * Bounded in-process negative memo (todo 71): DEFINITIVE absences
   * ONLY (body `code: 2022` chain-unsupported, or `code: 1` with the
   * address absent from `result`) suppress re-fires for 6h; the
   * transient classes (network/timeout/5xx/broken envelope/odd codes)
   * are NEVER remembered and retry next request. Resets on deploy.
   */
  private readonly honeypotNegativeMemo = new HoneypotNegativeMemo();

  /**
   * Fan-out race deadline (dexter plan todo 21c): the WHOLE fan-out
   * stops being awaited here — unfinished fetchers are abandoned as
   * fail-open rejected records, so a straggler never blocks the
   * serve. Read once at construction (`staleMaxAgeMs` pattern), env
   * `SNAPSHOT_FANOUT_DEADLINE_MS` (default 4000). The per-fetcher
   * timeout (8s) still bounds each call; this bounds the whole run.
   */
  private readonly fanoutDeadlineMs: number = resolveFanoutDeadlineMs(
    process.env['SNAPSHOT_FANOUT_DEADLINE_MS'],
  );

  /**
   * In-flight background refresh (dexter plan todo 21a): the SWR
   * serve's fan-out runs fire-and-forget, but specs flush it through
   * `backgroundRefreshHandle()` before pinning downstream effects
   * (day-calls, cache/history writes). Last-started handle; in-memory
   * + reset-on-deploy (same class as the breaker/governor state).
   */
  private refreshInFlight: Promise<void> | null = null;

  public constructor(
    private readonly catalog: ChainCatalogPort,
    private readonly providers: ProviderRegistryService,
    private readonly kinds: AddressKindDetectorService,
    private readonly aggregator: SnapshotAggregatorService,
    private readonly history: SnapshotHistoryRepository,
    @Optional()
    @Inject(SNAPSHOT_QUOTE_PROVIDERS)
    private readonly fetchers: ReadonlyArray<QuoteFetcher> | null,
    // Union-typed param: `@Inject` is mandatory (design:paramtypes
    // emits `Object` under strictNullChecks — same latent DI gap the
    // `fastPath` comment below documents, and this lane's SWR refresh
    // needs the real cache warm: todo 21a + the 30s SWR lower bound
    // both assume "prod cache covers that range").
    @Optional()
    @Inject(CacheService)
    private readonly cache: CacheService | null,
    @Optional()
    @Inject(RateLimiterPort)
    private readonly outbound: RateLimiterPort | null = null,
    @Optional()
    @Inject(DevHoldingsPort)
    private readonly devHoldings: DevHoldingsPort | null = null,
    @Optional()
    @Inject(AggregationPolicyPort)
    private readonly policy: AggregationPolicyPort | null = null,
    @Optional()
    private readonly assets: AssetResolverService | null = null,
    @Optional()
    @Inject(LaunchpadDetectorService)
    private readonly launchpad: LaunchpadDetectorService | null = null,
    @Optional()
    @Inject(DexScreenerService)
    private readonly dexscreener: DexScreenerService | null = null,
    @Optional()
    @Inject(GeckoTerminalService)
    private readonly geckoterminal: GeckoTerminalService | null = null,
    @Optional()
    private readonly nullMetrics: SnapshotNullMetricsService | null = null,
    // Union-typed params emit `Object` metadata: `@Inject` is mandatory
    // here, otherwise Nest resolves null even when registered.
    @Optional()
    @Inject(DirectFastPathService)
    private readonly fastPath: DirectFastPathService | null = null,
    // Breaker (dexter plan todo 29, 19b3): THE one gating path. The
    // existing CircuitBreakerService (in-memory Map, constructed with
    // its defaults: 5 consecutive failures -> 30s cool-off) is wired
    // here; the registry `recordFailure` counters stay TELEMETRY-only
    // (`listStatus` for the gateway, never a gate) — one way, never
    // both. Memory store + reset-on-deploy ACCEPTED: a deploy wipes
    // the failure counts, so a flapping provider gets a clean slate
    // per deploy (documented, not hidden). Fail-open everywhere:
    // `canExecute === false` SKIPS the fetcher (explicit
    // `providerErrors` note), never throws, never blocks the card.
    @Optional()
    @Inject(CircuitBreakerService)
    private readonly breaker: CircuitBreakerService | null = null,
    // Discovery cache (dexter plan todo 30b): cache-first discovery
    // with tripwire verification. Null in hand-built specs -> direct
    // `getBestPairSummaryForChain` (byte-identical fallback).
    @Optional()
    @Inject(DiscoveryCacheService)
    private readonly discoveryCache: DiscoveryCacheService | null = null,
    // Metadata-identity reader (dexter plan todo 39): the post-merge
    // last-resort leg. Same provider the fast path uses (module
    // factory), `@Inject` mandatory on the union type. Null in
    // hand-built specs -> identity-less quotes stay as they are.
    @Optional()
    @Inject(OnchainSolanaReaderService)
    private readonly solanaReader: OnchainSolanaReaderService | null = null,
    // Singleflight (dexter plan todo 41a): N-concurrent same-key
    // snapshots collapse to ONE upstream run. Null in hand-built
    // specs -> direct call-through, byte-identical.
    @Optional()
    @Inject(SingleflightService)
    private readonly singleflight: SingleflightService | null = null,
    // Quota governor (dexter plan todo 41d): the ONE governor, read
    // BEFORE the fan-out. Null in hand-built specs -> admit all.
    @Optional()
    @Inject(QuotaGovernorService)
    private readonly governor: QuotaGovernorService | null = null,
    // Keyed token-level OHLC fallback (dexter plan todo 55): fires ONLY
    // when the Gecko pool route yields no candles (WENCAT class — no
    // indexed pools at all). Null in hand-built specs -> gecko-only,
    // byte-identical to pre-55.
    @Optional()
    @Inject(BirdeyeService)
    private readonly birdeye: BirdeyeService | null = null,
    // Existence gate (dexter plan todo 21b): a definitively dead
    // address answers a differentiated `invalid` fast, BEFORE any
    // provider fan-out. Null in hand-built specs -> gate skipped,
    // byte-identical; DI specs override it (hermeticity: the real
    // service would reach Alchemy/Solana RPC).
    @Optional()
    @Inject(AddressExistenceService)
    private readonly existence: AddressExistenceService | null = null,
    // Pending aging (dexter plan todo 21d): consecutive-pending
    // escalation to `invalid`. Null in hand-built specs -> pending
    // stays pending, byte-identical (counter resets on deploy).
    @Optional()
    @Inject(PendingAgingService)
    private readonly aging: PendingAgingService | null = null,
    // GoPlus honeypot leg (dexter plan todo 71, Fase 1): keyless
    // taxes-only adapter consumed by the snapshot tail (the `honeypot`
    // extra). Null in hand-built specs -> leg absent (silence),
    // byte-identical to pre-71. Appended LAST so positional hand-built
    // ctors keep compiling.
    @Optional()
    @Inject(GoplusService)
    private readonly goplus: GoplusService | null = null,
  ) {}

  /** In-flight half-open probe key (at most ONE globally — the single cheapest-fetcher probe). */
  private halfOpenProbeInFlight: string | null = null;

  private async resolveAssetId(
    chain: string,
    address: string,
    quote: { symbol: string | null; name: string | null },
  ): Promise<string | null> {
    if (this.assets === null || this.assets === undefined) {
      return null;
    }
    try {
      const found = await this.assets.resolve({ chain, contract: address });
      return found.id;
    } catch {
      try {
        const created = await this.assets.upsert({
          chain,
          contract: address,
          symbol: quote.symbol,
          name: quote.name,
        });
        return created.id;
      } catch {
        return null;
      }
    }
  }

  private async resolveLaunchpad(
    chain: string,
    address: string,
  ): Promise<LaunchpadInfo | null> {
    if (this.launchpad === null || this.launchpad === undefined) return null;
    try {
      return await this.launchpad.detectLaunchpad(chain, address);
    } catch {
      return null;
    }
  }

  /**
   * Honeypot leg (dexter plan todo 71 + `rick-compact-card` D1/D3 —
   * GoPlus taxes + SIM verdict + LP lock).
   *
   * Runs in the parallel tail as one more extra with its OWN budget
   * (`honeypotTailMs`, default 1500 — the 4th extra on mapped-chain
   * token scans queues in a second `runTailCapped` wave; concurrency
   * stays 3, no new circuit-breaker). The dedicated deadline exists
   * because the live GoPlus RTT (~389-467ms) loses the shared 400ms
   * extras race (todo-71 follow-up; the `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS`
   * precedent).
   *
   * Result shape `{reading, lpLock, transient}` (NEVER null): `runExtra`
   * catches inner throws SILENTLY (returns null, no note), so the
   * transient signal must survive the race to the post-loop slot
   * handling that writes the `tail:honeypot` note. Every exit is
   * explicit:
   *
   * - `goplus` service absent -> all-null, not transient;
   * - negative-memo hit (definitive absence remembered) -> all-null;
   * - adapter throws (defensive — the real adapter never does) ->
   *   `transient: true`;
   * - `reading` (source answered, entry present): `reading`
   *   `{buy, sell, sim}` + `lpLock` from the same envelope. The
   *   SIM kill-switch (`simVerdictEnabled`, read once at construction)
   *   applies HERE and nulls ONLY `sim` — taxes and `lpLock` survive.
   *   The reading is emitted even when BOTH tax sides are `null`
   *   ("probed, no data" — CAKE — is distinct from "no source").
   * - `transient` verdict -> `transient: true`;
   * - DEFINITIVE absence (body `code: 2022` chain-unsupported, or
   *   `code: 1` with the address absent from `result`): memoized
   *   (bounded 500, 6h) + no field, no note.
   *
   * A reading with `lpLock: null` is still a reading — it is never
   * memoized (the memo only remembers definitive absences).
   *
   * The memo is checked BEFORE the call (a definitive absence costs
   * zero network for 6h); only the classifier's definitive verdicts
   * reach `remember` — the classification table lives in
   * `snapshot/domain/snapshot-honeypot.ts`.
   */
  private async resolveHoneypot(
    chainId: number,
    key: string,
    address: string,
  ): Promise<{
    readonly reading: HoneypotReading | null;
    readonly lpLock: LpLockReading | null;
    readonly transient: boolean;
  }> {
    const goplus = this.goplus;
    if (goplus === null || goplus === undefined) {
      return { reading: null, lpLock: null, transient: false };
    }
    const nowMs = Date.now();
    if (this.honeypotNegativeMemo.has(key, nowMs)) {
      return { reading: null, lpLock: null, transient: false };
    }
    let probe: HoneypotProbe;
    try {
      probe = await goplus.getTokenSecurity(chainId, address);
    } catch {
      // Defensive: the adapter itself NEVER throws (catch-all →
      // transient) — a hand-mock might.
      return { reading: null, lpLock: null, transient: true };
    }
    if (probe.kind === 'reading') {
      return {
        reading: this.simVerdictEnabled
          ? probe.reading
          : { ...probe.reading, sim: null },
        lpLock: probe.lpLock,
        transient: false,
      };
    }
    if (probe.kind === 'transient') {
      return { reading: null, lpLock: null, transient: true };
    }
    // Definitive absence — the ONLY memoized class (chain-unsupported
    // 2022 / address absent from a success `result`).
    this.honeypotNegativeMemo.remember(key, nowMs);
    return { reading: null, lpLock: null, transient: false };
  }

  /**
   * Metadata identity, LAST resort (dexter plan todo 39): when the
   * merged quote names nothing AND the fast path pinned no source,
   * read the Solana Metaplex metadata PDA once. Solana token-kind
   * ONLY (no EVM metadata leg — EVM identity-less stays as-is);
   * Token-2022 mints ride the same PDA derivation (program-agnostic
   * — only extension-embedded names without a PDA are out of scope).
   * Identity-ONLY: symbol/name fill from metadata, everything else
   * (supply/holders/price) stays aggregator-owned. Own budget
   * (`METADATA_IDENTITY_BUDGET_MS`), fail-open null; a timeout names
   * itself in `providerErrors` like the tail legs do.
   */
  private async resolveMetadataIdentity(
    chain: string,
    kind: string,
    address: string,
    quote: SnapshotQuote,
    providerErrors: Record<string, string>,
  ): Promise<{
    readonly symbol: string | null;
    readonly name: string | null;
  } | null> {
    if (chain !== 'solana' || kind !== 'token') return null;
    if (quote.symbol !== null || quote.name !== null) return null;
    if (this.solanaReader === null || this.solanaReader === undefined) {
      return null;
    }
    try {
      const raced = await withTailBudget(
        this.solanaReader.getTokenBasics(address),
        METADATA_IDENTITY_BUDGET_MS,
      );
      if (raced === TAIL_TIMEOUT) {
        providerErrors['metadata-identity'] =
          `timeout (metadata-identity budget ${METADATA_IDENTITY_BUDGET_MS}ms) — degraded to null, fail-open`;
        return null;
      }
      const meta = raced?.metadata ?? null;
      if (meta === null) return null;
      const symbol = meta.symbol !== '' ? meta.symbol : null;
      const name = meta.name !== '' ? meta.name : null;
      if (symbol === null && name === null) return null;
      return { symbol, name };
    } catch {
      return null;
    }
  }

  /**
   * Strict per-chain venue (plan todo 18): the snapshot ALWAYS
   * carries an explicit chain, so the venue resolves through the
   * chain-scoped summary — never the cross-chain best pair. Chain
   * with no pair (or no slug mapping) resolves `null`; the renderer
   * already renders that as empty.
   *
   * Gecko fallback (plan todo 26): when DexScreener has no pair for
   * the token (e.g. STAGEVEIL on robinhood), the GeckoTerminal pool
   * carries the venue in `relationships.dex.data.id` (live:
   * `pons-v2-dex`). The dex id passes through verbatim with empty
   * labels — dexter's display table capitalizes unknown ids, so the
   * card stays non-empty without a new table on either side.
   *
   * Pair creation (dexter plan todo 63 + `rick-compact-card` D1): the
   * SAME `best` summary that names the venue (hit AND miss — the
   * object is in hand on both) carries the best-pair `pairCreatedAt`
   * raw ms; it rides out beside the venue and `buildSnapshot`
   * converts it once to ISO. The Gecko fallback leg uses the pool
   * ALREADY fetched here: `selectPoolQuote` exposes
   * `poolCreatedAtMs` (GT `pool_created_at`), so the creation time
   * costs ZERO extra calls — no second `getTokenPools`, no OHLC, no
   * Birdeye. Caveat: the ms is the PICKED pool's creation time (pair
   * age, not token deploy age).
   *
   * ATH-seed plumbing (dexter plan todo 68, todo-63 anatomy): the
   * same summary also carries the best-pair address and OUR side
   * (`pairAddress`/`pairSide`) — the one-shot ATH seed's Gecko pool id
   * and `token=base|quote` series selector. ZERO extra calls: DSC's
   * `pairAddress` IS the GT pool id (live-verified), and the side
   * comes from the summary's own `baseToken`/`quoteToken` addresses
   * (already side-checked by the discovery selection, todo 20). The
   * Gecko fallback leg passes `pick.poolAddress` + `pick.side`
   * verbatim. `null` anywhere -> the seed skips (0 calls).
   */
  private async resolveVenue(
    chain: string,
    address: string,
  ): Promise<{
    readonly venue: SnapshotVenue | null;
    readonly pairCreatedAtMs: number | null;
    readonly pairAddress: string | null;
    readonly pairSide: 'base' | 'quote' | null;
  }> {
    if (this.dexscreener !== null && this.dexscreener !== undefined) {
      try {
        // Discovery cache first (dexter plan todo 30b): tripwire-
        // verified cached discovery, zero `token-pairs` calls on hit;
        // direct strict discovery when the cache service is absent.
        const best =
          this.discoveryCache !== null && this.discoveryCache !== undefined
            ? await this.discoveryCache.resolveDiscovery(chain, address)
            : await this.dexscreener.getBestPairSummaryForChain(chain, address);
        if (best !== null) {
          return {
            venue: toVenueOrNull({ dexId: best.dexId, labels: best.labels }),
            pairCreatedAtMs: best.pairCreatedAt ?? null,
            pairAddress: nonEmptyTrimmed(best.pairAddress),
            pairSide: dexscreenerPoolSide(
              best.baseToken?.address,
              best.quoteToken?.address,
              address,
            ),
          };
        }
      } catch {
        // Fall through to the Gecko leg below (fail-open, never throws).
      }
    }
    if (
      this.geckoterminal === null ||
      this.geckoterminal === undefined ||
      !GECKO_SUPPORTED_CHAINS.includes(chain)
    ) {
      return {
        venue: null,
        pairCreatedAtMs: null,
        pairAddress: null,
        pairSide: null,
      };
    }
    try {
      const slug = GECKO_NETWORK_SLUGS[chain] ?? chain;
      const pools = await this.geckoterminal.getTokenPools(slug, address);
      const pick = selectPoolQuote(pools, address);
      if (pick === null || pick.dexId === null) {
        return {
          venue: null,
          pairCreatedAtMs: null,
          pairAddress: null,
          pairSide: null,
        };
      }
      // Gecko pool creation time (`rick-compact-card` D1): the pick
      // already resolved above, so this is ZERO extra calls. `null`
      // when GT omits `pool_created_at` (honest Age gap).
      return {
        venue: toVenueOrNull({ dexId: pick.dexId, labels: [] }),
        pairCreatedAtMs: pick.poolCreatedAtMs ?? null,
        pairAddress: nonEmptyTrimmed(pick.poolAddress),
        pairSide: pick.side ?? null,
      };
    } catch {
      return {
        venue: null,
        pairCreatedAtMs: null,
        pairAddress: null,
        pairSide: null,
      };
    }
  }

  /**
   * OHLC-derived 24h change (dexter plan todos 33 + 46 + 55, fallback leg).
   *
   * PRECEDENCE (structural, not advisory): a non-null `nativeChange`
   * — i.e. ANY native field surviving the fan-out merge (DexScreener,
   * Birdeye, CoinGecko, Moralis, Gecko `/info` itself) — returns null
   * here with ZERO extra calls, so natives always win. The leg fires
   * only when every native is null. Source ladder (todo 55):
   *
   * 1. Gecko pool route (keyless, preferred, unchanged): pool discovery
   *    (same two-step as the gecko fetcher: `getTokenPools`, then
   *    `searchPools` on miss) plus ONE `hour/aggregate=1` OHLC call.
   * 2. When that yields NO candles (no pool row at all — the WENCAT
   *    class — or an empty fetch), the keyed Birdeye token-level route
   *    (`/defi/v3/ohlcv`, `type=1H` over the seed window) backs the leg
   *    instead, tagged `birdeye-ohlcv` end-to-end so seeds/provenance
   *    never claim Gecko for data Gecko did not index.
   *
   * The exact-24h-window math and the backfill below are IDENTICAL for
   * both sources. Anything missing or out-of-window resolves null
   * (fail-open, never throws — same contract as `resolveVenue` above).
   *
   * TODO 46 (backfill, camino al 0% honesto): the acquired candles
   * ALSO seed history once per pool (`seedOhlcvBackfill` — candle-time
   * `createdAt`, idempotent via `unique(key, createdAt)`), and the
   * derivation prefers outright-24h-vs-now-live (history anchor vs
   * the current merged price, strictly fresher than any candle)
   * over the candle-pure math (kept as fallback for the
   * no-live-price/pending shape). Seeding piggybacks THIS fetch —
   * no dedicated backfill fetch ever exists.
   */
  private async resolveDerivedChange24h(
    chain: string,
    address: string,
    nativeChange: number | null,
    live: {
      readonly priceUsd: number | null;
      readonly totalSupply: number | null;
      readonly maxSupply: number | null;
    },
    identity: { readonly key: string; readonly kind: string },
  ): Promise<{
    readonly change: number | null;
    readonly seeded: number;
    readonly source: string | null;
    /**
     * Venue market reading harvested by the candle-acquisition leg (plan
     * todo 72, fork B). Travels even when the derivation itself resolves
     * null: it is an independent fill for the quote, not a candle
     * product.
     */
    readonly market: VenueMarketReading | null;
  }> {
    if (nativeChange !== null && nativeChange !== undefined) {
      // Native wins: zero calls, zero seeds, zero fill.
      return { change: null, seeded: 0, source: null, market: null };
    }
    const nowMs = Date.now();
    const acquired = await this.acquireDerivationCandles(chain, address, nowMs);
    if (acquired === null) {
      return { change: null, seeded: 0, source: null, market: null };
    }
    if (acquired.market !== null && acquired.market.priceChange24h !== null) {
      // Venue-change path (fork B): the picked pool's h24 percentage is
      // a real native reading, so it wins the derivation. NO candles
      // were fetched (`source: null` keeps `geckoterminal-ohlcv` out of
      // `sources`); the fill's own provenance is `geckoterminal`, added
      // by the seam. The backfill does not run for this class — native
      // change means no candle history, exactly like any other native.
      return {
        change: acquired.market.priceChange24h,
        seeded: 0,
        source: null,
        market: acquired.market,
      };
    }
    try {
      const seeded = await this.seedOhlcvBackfill(
        identity.key,
        identity.kind,
        chain,
        address,
        acquired.candles,
        live,
        nowMs,
        acquired.source,
      );
      const outright = await this.resolveOutrightVsLiveChange(
        chain,
        address,
        live.priceUsd,
        nowMs,
      );
      if (outright !== null) {
        return {
          change: outright,
          seeded,
          source: acquired.source,
          market: acquired.market,
        };
      }
      return {
        change: deriveChange24hFromOhlcv(acquired.candles, nowMs),
        seeded,
        source: acquired.source,
        market: acquired.market,
      };
    } catch {
      // The fill is independent of the derivation (and was already
      // fetched) — never drop it on a seeding/anchor error.
      return {
        change: null,
        seeded: 0,
        source: null,
        market: acquired.market,
      };
    }
  }

  /**
   * Candle acquisition ladder (todo 55): Gecko pool route first — once
   * it has PICKED a pool its answer is final-shape (possibly empty,
   * which pre-55 used to proceed to the history-anchor attempt with
   * zero seeds; that fidelity is preserved below). Only a candle-less
   * Gecko answer escalates to the keyed Birdeye token-level route
   * (WENCAT class). `null` = no source served candles → the caller
   * answers the pre-55 dead-end shape (`{change: null, seeded: 0}`)
   * WITHOUT a history-anchor attempt, exactly like the old no-pick /
   * gecko-threw branches.
   *
   * Plan todo 72 (fork B): the SAME picked pool also carries the market
   * numbers the quote is missing (`liquidityUsd`, `volume24hUsd`,
   * `priceChange24h`, `poolCreatedAtMs`) — harvested here at zero extra
   * cost. When the pick answers the 24h change itself, this leg returns
   * IMMEDIATELY (no OHLC call, no backfill): that percentage is a native
   * reading and the caller lets it win with `source: null`.
   */
  private async acquireDerivationCandles(
    chain: string,
    address: string,
    nowMs: number,
  ): Promise<{
    readonly candles: ReadonlyArray<OhlcvCandle> | null;
    readonly source: string;
    /**
     * Market numbers carried by the pool this leg already picked (plan
     * todo 72, fork B). Harvested from the SAME `selectPoolQuote`
     * result the OHLC route consumes — zero extra calls, outside the
     * 400ms tail budget. `null` when no pool was picked or the Gecko
     * leg died.
     */
    readonly market: VenueMarketReading | null;
  } | null> {
    let geckoPicked = false;
    let geckoAnswered = false;
    let candles: ReadonlyArray<OhlcvCandle> | null = null;
    let market: VenueMarketReading | null = null;
    if (
      this.geckoterminal !== null &&
      this.geckoterminal !== undefined &&
      GECKO_SUPPORTED_CHAINS.includes(chain)
    ) {
      try {
        const slug = GECKO_NETWORK_SLUGS[chain] ?? chain;
        const pools = await this.geckoterminal.getTokenPools(slug, address);
        let pick = selectPoolQuote(pools, address);
        if (pick === null) {
          const searchPools = this.geckoterminal.searchPools?.bind(
            this.geckoterminal,
          );
          if (typeof searchPools === 'function') {
            pick = selectPoolQuote(await searchPools(address), address);
          }
        }
        if (pick !== null) {
          market = {
            dexId: pick.dexId,
            liquidityUsd: pick.liquidityUsd,
            volume24hUsd: pick.volume24hUsd,
            priceChange24h: pick.priceChange24h,
            volume1hUsd: pick.volume1hUsd,
            priceChange1h: pick.priceChange1h,
            txns1hBuys: pick.txns1hBuys,
            txns1hSells: pick.txns1hSells,
            poolCreatedAtMs: pick.poolCreatedAtMs,
          };
          // Fork B (plan todo 72): the picked pool answers the 24h change
          // itself, so that number IS a native reading — the OHLC
          // derivation and its backfill are unnecessary. Returning here
          // skips the hour call entirely (zero extra HTTP); the caller
          // returns the venue change with `source: null`, so no
          // `geckoterminal-ohlcv` provenance is claimed for a candle
          // series we never fetched.
          if (market.priceChange24h !== null) {
            return { candles: null, source: OHLC_BACKFILL_SOURCE, market };
          }
        }
        if (pick !== null && pick.poolAddress !== null) {
          geckoPicked = true;
          candles = await this.geckoterminal.getPoolOhlcv(
            slug,
            pick.poolAddress,
            pick.side ?? 'base',
          );
          geckoAnswered = true;
        } else {
          // Definitive no-pool answer (pre-55 early return).
          geckoAnswered = true;
        }
      } catch {
        // Gecko leg dead — the keyed fallback below may still serve.
      }
    }
    let source: string | null =
      candles !== null && candles.length > 0 ? OHLC_BACKFILL_SOURCE : null;
    if (
      source === null &&
      this.birdeye !== null &&
      this.birdeye !== undefined &&
      BIRDEYE_SUPPORTED_CHAINS.includes(chain)
    ) {
      try {
        const tokenCandles = await this.birdeye.getTokenOhlcv(
          address,
          chain,
          '1H',
          Math.floor((nowMs - OHLC_BACKFILL_WINDOW_MS) / 1000),
          Math.floor(nowMs / 1000),
        );
        if (tokenCandles !== null && tokenCandles.length > 0) {
          candles = tokenCandles;
          source = OHLC_BACKFILL_SOURCE_BIRDEYE;
        }
      } catch {
        // Fallback dead — keep whatever the Gecko leg produced.
      }
    }
    if (source === null) {
      // No candles from either source. Pre-55 fidelity: a picked Gecko
      // answer that came back empty still proceeds (zero seeds; the
      // history-anchor attempt stands); every other dead end skips.
      if (geckoPicked && geckoAnswered) {
        return { candles, source: OHLC_BACKFILL_SOURCE, market };
      }
      if (market !== null) {
        // A pool was picked (and carried market numbers) but no candle
        // source served it. The numbers are still legitimately ours —
        // hand them up with no candles to seed.
        return { candles: null, source: OHLC_BACKFILL_SOURCE, market };
      }
      return null;
    }
    return { candles, source, market };
  }

  /**
   * One-time per-pool OHLC seed (dexter plan todo 46; source-aware
   * todo 55). Builds rows from the derivation fetch's candles (same
   * merged supply the FDV seam seals this encounter with) and persists
   * them with candle-time `createdAt`, tagged with the ACTUAL source
   * that produced them (`geckoterminal-ohlcv` | `birdeye-ohlcv`).
   * Fail-open: any store error degrades to zero seeded (the change leg
   * below still runs on the candles). Returns the count of newly
   * inserted rows (collisions report 0).
   */
  private async seedOhlcvBackfill(
    key: string,
    kind: string,
    chain: string,
    address: string,
    candles: ReadonlyArray<OhlcvCandle> | null,
    live: {
      readonly totalSupply: number | null;
      readonly maxSupply: number | null;
    },
    nowMs: number,
    source: string,
  ): Promise<number> {
    try {
      const rows = buildOhlcvSeedRows(
        candles,
        {
          key,
          chain,
          address,
          kind,
          totalSupply: live.totalSupply,
          maxSupply: live.maxSupply,
          source,
        },
        nowMs,
      );
      let seeded = 0;
      for (const row of rows) {
        const saved = await this.history.saveSeeded(row);
        if (saved !== null) seeded += 1;
      }
      if (seeded > 0) {
        this.logger.debug(
          `ohlcv-backfill seeded chain=${chain} address=${address} rows=${seeded}`,
        );
      }
      return seeded;
    } catch {
      return 0;
    }
  }

  /**
   * One-time historical FDV-ATH seed (dexter plan todo 68). Fires ONLY
   * when `findFdvAth` reported the marker ABSENT (cold OR existing
   * token — once per token) and every guard holds; at most ONE Gecko
   * `ohlcv/day` call per request, wrapped in its own
   * `SNAPSHOT_ATH_SEED_TIMEOUT_MS` budget so the card never waits past
   * the pinned 2s. No throw ever escapes (fail-open total): 429/401/
   * 404/[]/timeout all resolve to "no seed this time" and the card
   * continues as-seen.
   *
   * Negative memo discipline: a DEFINITIVE absence (the day leg
   * answered `null` — 404/401/400/empty, or a series with no seedable
   * candle) is remembered for the pinned TTL; TRANSIENT classes
   * (429/5xx/timeout — the leg THROWS `RetryableProviderError`, or the
   * budget abandons the call) are NEVER remembered and retry on the
   * next request.
   *
   * Guards (todo 68): kind=token, supported chain, non-empty pool id,
   * KNOWN side, supply `total ?? max` finite > 0, and the pure builder
   * re-checks candles (non-empty, sane high, ts <= now + inside the
   * retention window). A fast-path EVM card carries no supply -> the
   * supply guard answers 0 calls. Legacy hand-mocks without the new
   * day method skip via the `typeof` guard (same precedent as
   * `searchPools?.bind`), so every pre-68 spec stays byte-identical.
   */
  private async seedFdvAthHistory(args: {
    readonly key: string;
    readonly chain: string;
    readonly address: string;
    readonly kind: string;
    readonly totalSupply: number | null;
    readonly maxSupply: number | null;
    readonly pairAddress: string | null;
    readonly pairSide: 'base' | 'quote' | null;
    /**
     * Merged pair creation (ms epoch, todo 63 + plan todo 72): the
     * builder clamps the seed stamp to it so a launch-day ATH never
     * predates the pool. `null` keeps the candle-open stamp.
     */
    readonly pairCreatedAtMs: number | null;
  }): Promise<number> {
    if (!this.athSeedEnabled) return 0;
    if (args.kind !== 'token') return 0;
    if (!GECKO_SUPPORTED_CHAINS.includes(args.chain)) return 0;
    const pool = (args.pairAddress ?? '').trim();
    if (pool === '') return 0;
    const side = args.pairSide;
    if (side !== 'base' && side !== 'quote') return 0;
    const supply = args.totalSupply ?? args.maxSupply;
    if (typeof supply !== 'number' || !Number.isFinite(supply) || supply <= 0) {
      return 0;
    }
    const gecko = this.geckoterminal;
    if (gecko === null || gecko === undefined) return 0;
    const getDay = gecko.getPoolOhlcvDay?.bind(gecko);
    if (typeof getDay !== 'function') return 0;
    const nowMs = Date.now();
    if (this.athSeedNegativeMemo.has(args.key, nowMs)) return 0;
    // 60s throttle pause (plan todo 72, P1): checked AFTER the 6h
    // definitive memo (absence outranks pressure) and before any
    // network. A pause never claims the token has no series.
    if (this.athSeedTransientBackoff.has(args.key, nowMs)) return 0;
    try {
      const slug = GECKO_NETWORK_SLUGS[args.chain] ?? args.chain;
      const raced = await withTailBudget(
        getDay(slug, pool, side),
        SNAPSHOT_ATH_SEED_TIMEOUT_MS,
      );
      if (raced === TAIL_TIMEOUT) {
        // Abandoned, transient by definition: never memoized.
        this.logger.debug(
          `fdv-ath seed timeout chain=${args.chain} address=${args.address} ` +
            `(budget ${SNAPSHOT_ATH_SEED_TIMEOUT_MS}ms) — fail-open, retry next request`,
        );
        return 0;
      }
      if (raced === null) {
        this.athSeedNegativeMemo.remember(args.key, nowMs);
        return 0;
      }
      const row = buildFdvAthSeedRow(
        raced,
        {
          key: args.key,
          chain: args.chain,
          address: args.address,
          kind: args.kind,
          totalSupply: args.totalSupply,
          maxSupply: args.maxSupply,
          windowDays: this.athSeedDays,
          poolCreatedAtMs: args.pairCreatedAtMs,
        },
        nowMs,
      );
      if (row === null) {
        this.athSeedNegativeMemo.remember(args.key, nowMs);
        return 0;
      }
      const saved = await this.history.saveSeeded(row);
      if (saved === null) return 0;
      this.logger.log(
        `fdv-ath seed chain=${args.chain} address=${args.address} ` +
          `pool=${pool} fdvUsd=${row.quote.fdvUsd} at=${row.createdAt}`,
      );
      return 1;
    } catch (err) {
      // Transient (429/5xx/timeout/network): fail-open. A 429 is the ONE
      // class that earns a pause (plan todo 72, P1): it reports upstream
      // PRESSURE, not absence, so it lands in the 60s transient memo —
      // NEVER in the 6h definitive one. Timeouts/5xx keep the pre-72
      // behavior (retry on the next request).
      if (err instanceof RetryableProviderError && err.status === 429) {
        this.athSeedTransientBackoff.remember(args.key, Date.now());
      }
      return 0;
    }
  }

  /**
   * Outright-24h vs now-live (dexter plan todo 46): the past anchor
   * is the history row (backfill + live — the seed above runs BEFORE
   * this read, so the first encounter already anchors on its own
   * candles) nearest to exactly-24h-ago within ±2h; the now-leg is
   * the current merged price. Gaps (no anchor, no live price) → null.
   * Fail-open: any history error answers null (the candle-pure
   * fallback still runs at the call above).
   */
  private async resolveOutrightVsLiveChange(
    chain: string,
    address: string,
    livePriceUsd: number | null,
    nowMs: number,
  ): Promise<number | null> {
    try {
      const anchor = await this.history.findAnchorAt(
        chain,
        address,
        nowMs - OHLC_CHANGE_WINDOW_MS,
        OHLC_CHANGE_PAST_TOLERANCE_MS,
      );
      return deriveOutrightVsLiveChange(anchor?.quote?.priceUsd, livePriceUsd);
    } catch {
      return null;
    }
  }

  /**
   * Breaker gate (todo 29, fail-open skip-not-throw). Fetchers whose
   * breaker is open are REMOVED from this snapshot's fan-out (the skip
   * is named in `providerErrors` downstream — never silent, never a
   * throw). Half-open admits a SINGLE probe: the first half-open
   * fetcher in policy (cheapest-first) order goes through while a
   * probe is in flight; the rest skip until it settles. Without an
   * injected breaker this is the identity (zero behavior change, so
   * all pre-breaker specs stay green untouched).
   */
  private applyBreakerGate(fetchers: ReadonlyArray<QuoteFetcher>): {
    readonly admitted: ReadonlyArray<QuoteFetcher>;
    readonly skipped: ReadonlyArray<string>;
    readonly halfOpenKey: string | null;
  } {
    if (this.breaker === null || this.breaker === undefined) {
      return { admitted: fetchers, skipped: [], halfOpenKey: null };
    }
    const admitted: Array<QuoteFetcher> = [];
    const skipped: Array<string> = [];
    let halfOpenKey: string | null = null;
    const probeBusy = this.halfOpenProbeInFlight !== null;
    for (const fetcher of fetchers) {
      const key = snapshotBreakerKey(fetcher.name);
      if (!this.breaker.canExecute(key)) {
        skipped.push(fetcher.name);
        continue;
      }
      if (this.breaker.getState(key) === 'half-open') {
        if (probeBusy || halfOpenKey !== null) {
          skipped.push(fetcher.name);
          continue;
        }
        halfOpenKey = key;
        this.halfOpenProbeInFlight = key;
        this.logger.log(
          `breaker half-open probe admitted (single cheapest): ${fetcher.name}`,
        );
      }
      admitted.push(fetcher);
    }
    return { admitted, skipped, halfOpenKey };
  }

  /**
   * Breaker state metric (todo 29): per-fetcher circuit state for the
   * future `/metrics` exporter (mirrors `SnapshotNullMetricsService`
   * — counts there, states here). Unknown fetchers read `closed`.
   */
  public breakerStates(): Record<string, string> {
    const states: Record<string, string> = {};
    for (const provider of this.providers.listProviders()) {
      states[provider.name] =
        this.breaker?.getState(snapshotBreakerKey(provider.name)) ?? 'closed';
    }
    return states;
  }

  public async getSnapshot(
    input: AddressSnapshotInput,
  ): Promise<AddressSnapshot> {
    const entryStartedAt = performance.now();
    const chain = (input.chain ?? '').trim();
    if (chain === '') {
      throw new NotFoundException('Chain qualifier is required');
    }
    const known = await this.catalog.findById(chain);
    if (known === null) {
      throw new NotFoundException(`Unknown chain: ${chain}`);
    }
    const kind = await this.kinds.detect({
      chain: known.id,
      value: input.value,
      kindHint: input.kindHint,
      probe: input.probe ?? null,
    });
    const kindMs = Math.round(performance.now() - entryStartedAt);
    const id = AddressIdVo.from(known.id, input.value, kind);
    const supporting = this.providers
      .listProviders()
      .filter((provider) => provider.supportsChains.includes(known.id))
      .map((provider) => provider.name);
    // Normalization IS `AddressIdVo` (no new function by design):
    // the singleflight key is the same normalized cache key below.
    const cacheKey = `snapshot:${id.chain}:${id.address}:${id.kind}`;
    const run = (): Promise<AddressSnapshot> =>
      this.getSnapshotInner({
        knownId: known.id,
        inputValue: input.value,
        cacheKey,
        kind,
        id,
        supporting,
        kindMs,
      });
    // Singleflight at the `getSnapshot` entry (the single choke point
    // every edge/batch caller funnels through): N concurrent same-key
    // calls collapse to ONE upstream run.
    if (this.singleflight !== null && this.singleflight !== undefined) {
      return this.singleflight.run(cacheKey, run);
    }
    return run();
  }

  private async getSnapshotInner(args: {
    readonly knownId: string;
    readonly inputValue: string;
    readonly cacheKey: string;
    readonly kind: string;
    readonly id: AddressIdVo;
    readonly supporting: ReadonlyArray<string>;
    readonly kindMs: number;
  }): Promise<AddressSnapshot> {
    const startedAt = performance.now();
    const { knownId, inputValue, cacheKey, kind, id, supporting, kindMs } =
      args;
    if (this.cache) {
      const cached = await this.cache.get<AddressSnapshot>(cacheKey);
      if (cached !== null) {
        // Metric only: a pre-deploy pending row served from cache.
        // Post-deploy this must decay to 0 (nothing writes pending
        // anymore) — a nonzero `cached` past deploy+60s is the alarm.
        if (cached.status === 'pending') {
          this.nullMetrics?.record('cached');
        }
        return cached;
      }
    }
    // SWR-now (dexter plan todo 21a): a warm `ready` history row within
    // [numbers TTL, stale bound) serves IMMEDIATELY — the fan-out runs
    // in background (deduped via singleflight under `refresh:<key>`).
    // Never cached here; the next request re-serves SWR while the
    // refresh is in flight and a successful refresh warms the cache.
    const swrStartedAt = performance.now();
    const swr = await this.tryServeSwrNow({
      knownId,
      inputValue,
      kind,
      id,
      supporting,
    });
    if (swr !== null) {
      const swrMs = Math.round(performance.now() - swrStartedAt);
      const refresh = this.startBackgroundRefresh({
        knownId,
        inputValue,
        cacheKey,
        kind,
        id,
        supporting,
      });
      this.logger.log(
        `swr-now chain=${knownId} ageMs=${roundMs(swr.staleAgeMs)} ` +
          `swrMs=${swrMs} refresh=${refresh} ` +
          `totalMs=${Math.round(performance.now() - startedAt)}`,
      );
      return swr;
    }
    // Existence gate (dexter plan todo 21b): a definitively dead address
    // answers `invalid` BEFORE any provider fan-out (fast,
    // differentiated, zero quota burn). Runs AFTER SWR-now (warm tokens
    // never pay the probe) and ONLY for token/unknown kinds; every
    // non-`missing` verdict fails open into the pipeline below.
    const existenceStartedAt = performance.now();
    const existence = await this.probeExistence(knownId, inputValue, kind);
    const existenceMs = Math.round(performance.now() - existenceStartedAt);
    if (existence !== null && existence.verdict === 'missing') {
      this.aging?.clear(id.key, kind);
      const invalid = this.buildInvalidCard({
        id,
        supporting,
        providerErrors: { existence: existence.reason },
      });
      await this.persistInvalid(invalid, cacheKey);
      this.logger.log(
        `existence-gate chain=${knownId} verdict=missing existenceMs=${existenceMs} ` +
          `kindMs=${kindMs} totalMs=${Math.round(performance.now() - startedAt)}`,
      );
      return invalid;
    }
    const existenceLabel = existence === null ? 'skipped' : existence.verdict;
    // Pre-fan-out preparation (policy order -> governor -> outbound gate
    // -> breaker -> single retry) extracted for the background refresh
    // (todo 21a): both serve paths run the SAME gate chain.
    const prepared = this.prepareFetcherChain(kind, knownId, inputValue);
    // Direct fast-path FIRST (todo 22 wire-up): the fan-out starts
    // IMMEDIATELY (with the whole-run deadline, todo 21c) and the
    // on-chain readers race a HARD deadline against it. Sane direct
    // values serve at direct speed while the in-flight fan-out
    // completes in background for the log-only tolerance check (no
    // second run). ANY direct miss (no coverage, timeout, insane
    // values) awaits the already-running fan-out — the fallback path
    // below is byte-identical and pays ~zero direct penalty when the
    // miss is fast (instant-null coverage).
    const fanoutP = this.startFanout(
      knownId,
      inputValue,
      prepared.retried,
      prepared.halfOpenKey,
    );
    const fastStartedAt = performance.now();
    const fast =
      this.fastPath === null
        ? null
        : await this.fastPath.tryResolve(
            { chain: knownId, address: inputValue, kind },
            DIRECT_FAST_PATH_DEADLINE_MS,
          );
    const directMs = Math.round(performance.now() - fastStartedAt);
    if (fast !== null) {
      const built = await this.buildSnapshot({
        knownId,
        inputValue,
        cacheKey,
        kind,
        id,
        supporting,
        outcome: fast.outcome,
        launchpad: { resolved: true, value: fast.launchpad },
        venue: {
          resolved: true,
          value: fast.venue,
          pairCreatedAt: fast.pairCreatedAt,
          // ATH-seed plumbing (todo 68): raw pair address + our side
          // from the SAME discovery summary the fast path priced from.
          pairAddress: fast.pairAddress,
          pairSide: fast.pairSide,
        },
        skipDevHoldings: true,
        skipHoneypot: true,
        breakerSkipped: prepared.breakerSkipped,
        breakerAdmitted: [],
        governor: prepared.governor,
        outcomeIsAggregate: false,
      });
      this.observeGovernor(built.snapshot.providerErrors);
      this.logger.log(
        `direct-fast-path chain=${knownId} served=fast directMs=${directMs} ` +
          `discoveryMs=${roundMs(fast.timings.discoveryMs)} ` +
          `kindMs=${kindMs} tailMs=${built.tailMs} ` +
          `breakerSkipped=${prepared.breakerSkipped.length} ` +
          `governorShed=${prepared.shedCount} ` +
          `existence=${existenceLabel} existenceMs=${existenceMs} ` +
          `totalMs=${Math.round(performance.now() - startedAt)}`,
      );
      this.compareToleranceInBackground(
        fanoutP,
        knownId,
        inputValue,
        fast.outcome.quote,
      );
      return built.snapshot;
    }
    const fanoutStartedAt = performance.now();
    const outcome = await fanoutP;
    const fanoutMs = Math.round(performance.now() - fanoutStartedAt);
    const built = await this.buildSnapshot({
      knownId,
      inputValue,
      cacheKey,
      kind,
      id,
      supporting,
      outcome,
      launchpad: { resolved: false, value: null },
      venue: {
        resolved: false,
        value: null,
        pairCreatedAt: null,
        pairAddress: null,
        pairSide: null,
      },
      skipDevHoldings: false,
      skipHoneypot: false,
      breakerSkipped: prepared.breakerSkipped,
      breakerAdmitted: prepared.breakerAdmitted,
      governor: prepared.governor,
      outcomeIsAggregate: true,
    });
    this.observeGovernor(built.snapshot.providerErrors);
    this.logger.log(
      `direct-fast-path chain=${knownId} served=fanout directMs=${directMs} ` +
        `fanoutMs=${fanoutMs} kindMs=${kindMs} tailMs=${built.tailMs} ` +
        `breakerSkipped=${prepared.breakerSkipped.length} ` +
        `governorShed=${prepared.shedCount} ` +
        `existence=${existenceLabel} existenceMs=${existenceMs} ` +
        `totalMs=${Math.round(performance.now() - startedAt)}`,
    );
    return built.snapshot;
  }

  /**
   * Pre-fan-out preparation (dexter plan todo 21, extracted for the
   * SWR background refresh): policy order -> governor tier-skip ->
   * outbound token-bucket gate -> breaker skip -> single retry. The
   * live serve and the refresh run the SAME gate chain — body moved
   * verbatim from the pre-21 pipeline, no behavior change.
   */
  private prepareFetcherChain(
    kind: string,
    knownId: string,
    inputValue: string,
  ): {
    readonly retried: ReadonlyArray<QuoteFetcher>;
    readonly breakerSkipped: ReadonlyArray<string>;
    readonly breakerAdmitted: ReadonlyArray<string>;
    readonly halfOpenKey: string | null;
    readonly governor: {
      readonly key: string;
      readonly value: string;
    } | null;
    readonly shedCount: number;
  } {
    const active = (this.fetchers ?? []).filter((fetcher) =>
      fetcher.supportsChains.includes(knownId),
    );
    // Aggregators policy order (market-data restructure): ordered
    // provider list from context (kind, chain, fields, quota state,
    // account credits). Empty quota/credits is the identity — the
    // cascade order is byte-identical to the pre-policy pipeline.
    const ordered =
      this.policy === null
        ? active
        : this.policy.orderFetchers(active, {
            kind,
            chain: knownId,
            address: inputValue,
            fields: [...SNAPSHOT_QUOTE_FIELDS],
            quota: {},
            credits: {},
          });
    // Quota governor (dexter plan todo 41d): read BEFORE the fan-out,
    // AFTER the cache check (HITs cost zero quota and never consult
    // it). Every other call-site funnels through this method and
    // checks NOTHING itself.
    const governed = this.applyGovernorTierSkip(ordered);
    const gated = applyOutboundRateLimit(
      governed.admitted,
      this.outbound,
      (name: string) =>
        resolveProviderOutboundBudget(this.providers.listProviders(), name),
    );
    // Single retry OUTSIDE the gate (dexter plan todo 19b2): each attempt
    // runs the GATED fetch, so the retry burns from the SAME
    // `outbound:<name>` bucket — worst case 2 x cost per miss per
    // fetcher, never a phantom budget. Sibling 19b1 (stale floor)
    // untouched: stale serves only when the fanned-out result is
    // pending, retry or not.
    // Breaker sits between the outbound wrap and the retry (todo 29:
    // policy -> outbound-gate -> breaker-skip -> retry -> aggregate):
    // a skipped fetcher never runs, so it burns neither retry delay
    // nor outbound budget.
    const breakerGate = this.applyBreakerGate(gated);
    const retried = applySingleRetryFetchers(breakerGate.admitted);
    return {
      retried,
      breakerSkipped: breakerGate.skipped,
      breakerAdmitted: breakerGate.admitted.map((fetcher) => fetcher.name),
      halfOpenKey: breakerGate.halfOpenKey,
      governor: governed.note,
      shedCount: governed.skipped.length,
    };
  }

  /**
   * Fan-out with the whole-run race deadline (dexter plan todo 21c):
   * stragglers are abandoned at `SNAPSHOT_FANOUT_DEADLINE_MS` so they
   * never block the serve. The `.finally` releases a half-open probe
   * exactly as the pre-21 inline chain did (the aggregate itself
   * never rejects).
   */
  private startFanout(
    knownId: string,
    inputValue: string,
    retried: ReadonlyArray<QuoteFetcher>,
    halfOpenKey: string | null,
  ): Promise<AggregationOutcome> {
    return this.aggregator
      .aggregate(knownId, inputValue, retried, SNAPSHOT_PROVIDER_TIMEOUT_MS, {
        deadlineMs: this.fanoutDeadlineMs,
      })
      .finally(() => {
        // Half-open probe release: the probe is the FETCHER call, which
        // is done when the aggregate settles (the aggregate itself never
        // rejects — records inside). Release exactly our own key so a
        // concurrent snapshot's probe is never stolen.
        if (
          halfOpenKey !== null &&
          this.halfOpenProbeInFlight === halfOpenKey
        ) {
          this.halfOpenProbeInFlight = null;
        }
      });
  }

  /**
   * Existence probe wrapper (dexter plan todo 21b). Service-level kind
   * gate: only `token` (a dead token ask) and `unknown` (identity-less
   * ask) are probed; every other kind skips (log `existence=skipped`).
   * Absent service (hand-built specs) -> null (skipped). Never throws;
   * a null answer is the skip/fail-open marker, an answer object is a
   * verdict (`exists` | `missing` | `unresolved`).
   */
  private async probeExistence(
    knownId: string,
    inputValue: string,
    kind: string,
  ): Promise<ExistenceProbeResult | null> {
    if (this.existence === null || this.existence === undefined) return null;
    if (kind !== 'token' && kind !== 'unknown') return null;
    try {
      return await this.existence.probe(knownId, inputValue, kind);
    } catch {
      return null;
    }
  }

  /**
   * Invalid card (dexter plan todo 21b/21d): the shared builder for
   * every `invalid` serve (existence hit or aging escalation) — all
   * quote fields null, `assetId: null` (NO registry upsert), no
   * `fdvAth`, `degraded: false`, `sources` as passed (empty on both
   * paths: a dead address has no sources). The reason rides
   * `providerErrors` (`existence` | `aging`). Persisted + cached by
   * `persistInvalid` like a normal card (30s numbers TTL; the edge
   * cache accepts it — only pending/stale bodies skip there).
   */
  private buildInvalidCard(args: {
    readonly id: AddressIdVo;
    readonly supporting: ReadonlyArray<string>;
    readonly providerErrors: Record<string, string>;
    readonly sources?: ReadonlyArray<string>;
  }): AddressSnapshot {
    return {
      chain: args.id.chain,
      address: args.id.address,
      kind: args.id.kind,
      key: args.id.key,
      status: 'invalid',
      stale: false,
      staleAsOf: null,
      staleAgeMs: null,
      degraded: false,
      assetId: null,
      launchpad: null,
      venue: null,
      pairCreatedAt: null,
      honeypot: null,
      fdvAth: null,
      providers: args.supporting,
      sources: args.sources ?? [],
      providerErrors: args.providerErrors,
      ...emptySnapshotQuote(),
    };
  }

  /**
   * Persist + cache an invalid card (dexter plan todo 21b/21d): same
   * directness as the normal `history.save` path — a store error is
   * not swallowed here either (consistent with the ready path).
   * Cache: 30s numbers TTL, same writer rule as a ready card (only
   * pending/stale skip; invalid is a DEFINITIVE verdict, so caching
   * it is honest — and it is what makes the second hit fast).
   */
  private async persistInvalid(
    snapshot: AddressSnapshot,
    cacheKey: string,
  ): Promise<void> {
    await this.history.save({
      key: snapshot.key,
      chain: snapshot.chain,
      address: snapshot.address,
      kind: snapshot.kind,
      status: snapshot.status,
      quote: emptySnapshotQuote(),
      sources: snapshot.sources,
      providerErrors: snapshot.providerErrors,
    });
    if (this.cache) {
      await this.cache.set(cacheKey, snapshot, SNAPSHOT_CACHE_TTL_SECONDS);
    }
  }

  /**
   * In-flight background-refresh flush handle (dexter plan todo 21a):
   * the SWR serve's refresh is fire-and-forget on the wire, but specs
   * (and future graceful-shutdown wiring) await it before pinning
   * downstream effects. `null` when no refresh ever started.
   */
  public backgroundRefreshHandle(): Promise<void> | null {
    return this.refreshInFlight;
  }

  /**
   * SWR-now serve (dexter plan todo 21a). A recent `ready` history
   * row serves without waiting for the fan-out when its age sits in
   * [numbers TTL, stale bound): the 30s lower bound keeps pure
   * pipeline semantics for fresh rows (prod cache covers that range;
   * DI harnesses without a cache stay deterministic), the stale bound
   * is the same 24h the stale floor uses (wider would serve rows the
   * floor rejects).
   *
   * Card shape: `status: ready` + the stale trio from the row (ONLY
   * after `isStaleTrioValid` — a corrupt row falls through to the
   * pipeline, never a bit with no age), `launchpad`/`venue`/
   * `pairCreatedAt` null (live-only extras), `fdvAth` from existing
   * history ONLY (no seed, zero network), `sources` copied from the
   * row, `providerErrors` carrying the `swr-now` audit note (clean of
   * the governor quota-trigger pattern by construction). NEVER cached
   * (the refresh warms the cache on success); clears any aging
   * streak (fresh data is being fetched).
   */
  private async tryServeSwrNow(args: {
    readonly knownId: string;
    readonly inputValue: string;
    readonly kind: string;
    readonly id: AddressIdVo;
    readonly supporting: ReadonlyArray<string>;
  }): Promise<AddressSnapshot | null> {
    let row: SnapshotHistoryRow | null = null;
    try {
      row = await this.history.findLatestReady(
        args.id.key,
        args.kind,
        this.staleMaxAgeMs,
      );
    } catch {
      return null;
    }
    if (row === null) return null;
    const ageMs = Date.now() - Date.parse(row.createdAt);
    if (!Number.isFinite(ageMs) || ageMs < SNAPSHOT_SWR_MIN_AGE_MS) {
      return null;
    }
    if (!isStaleTrioValid(true, row.createdAt, ageMs)) return null;
    let fdvAth: SnapshotFdvAth | null = null;
    try {
      fdvAth = (await this.history.findFdvAth(args.knownId, args.inputValue))
        .ath;
    } catch {
      fdvAth = null;
    }
    this.aging?.clear(args.id.key, args.kind);
    return {
      chain: args.id.chain,
      address: args.id.address,
      kind: args.id.kind,
      key: args.id.key,
      status: 'ready',
      stale: true,
      staleAsOf: row.createdAt,
      staleAgeMs: ageMs,
      degraded: false,
      assetId: await this.resolveAssetId(
        args.knownId,
        args.inputValue,
        row.quote,
      ),
      launchpad: null,
      venue: null,
      pairCreatedAt: null,
      honeypot: null,
      fdvAth,
      providers: args.supporting,
      sources: [...row.sources],
      providerErrors: { 'swr-now': swrNowNote(ageMs) },
      ...emptySnapshotQuote(),
      ...row.quote,
      devWallets: row.quote.devWallets ?? null,
      devPctSupply: row.quote.devPctSupply ?? null,
    };
  }

  /**
   * Start the SWR background refresh (dexter plan todo 21a), deduped
   * via `SingleflightService` under the SEPARATE `refresh:<cacheKey>`
   * key (the serve key stays untouched for adherent callers). When a
   * refresh is already in flight the fn is NEVER called (no second
   * fan-out — the work was already started) and this call adheres to
   * the existing run; the returned mode feeds the `swr-now` log.
   * Always `.catch`-guarded: the refresh is fire-and-forget by design
   * (failures are logged inside `runBackgroundRefresh`'s callers'
   * happy path; nothing here may ever escape as an unhandled
   * rejection).
   */
  private startBackgroundRefresh(args: {
    readonly knownId: string;
    readonly inputValue: string;
    readonly cacheKey: string;
    readonly kind: string;
    readonly id: AddressIdVo;
    readonly supporting: ReadonlyArray<string>;
  }): 'started' | 'deduped' {
    const refreshKey = `refresh:${args.cacheKey}`;
    const sf = this.singleflight;
    if (sf !== null && sf !== undefined) {
      if (sf.has(refreshKey)) {
        this.refreshInFlight = sf
          .run(refreshKey, () => Promise.resolve())
          .then(() => undefined)
          .catch(() => undefined);
        return 'deduped';
      }
      this.refreshInFlight = sf
        .run(refreshKey, () => this.runBackgroundRefresh(args))
        .then(() => undefined)
        .catch(() => undefined);
      return 'started';
    }
    this.refreshInFlight = this.runBackgroundRefresh(args)
      .then(() => undefined)
      .catch(() => undefined);
    return 'started';
  }

  /**
   * Background refresh (dexter plan todo 21a): a REGULAR serve minus
   * the SWR shortcut — existence gate first, then the full gated
   * fan-out under the same deadline. No `observeGovernor` (the live
   * request already observed the same provider errors — this avoids
   * double-counting pressure). Refresh-pending is a TOTAL no-op
   * (`outcome.allFailed` return BEFORE tail/derived/seed: zero
   * side effects — with `allFailed` false `quoteFailed` is false
   * downstream, so the stale floor and the aging escalator are
   * unreachable and `buildSnapshot` needs no refresh flag). A ready
   * refresh persists + caches exactly like a live serve; a
   * definitive `missing` persists the invalid card.
   */
  private async runBackgroundRefresh(args: {
    readonly knownId: string;
    readonly inputValue: string;
    readonly cacheKey: string;
    readonly kind: string;
    readonly id: AddressIdVo;
    readonly supporting: ReadonlyArray<string>;
  }): Promise<void> {
    const { knownId, inputValue, cacheKey, kind, id, supporting } = args;
    const existence = await this.probeExistence(knownId, inputValue, kind);
    if (existence !== null && existence.verdict === 'missing') {
      this.aging?.clear(id.key, kind);
      const invalid = this.buildInvalidCard({
        id,
        supporting,
        providerErrors: { existence: existence.reason },
      });
      await this.persistInvalid(invalid, cacheKey);
      return;
    }
    const prepared = this.prepareFetcherChain(kind, knownId, inputValue);
    const outcome = await this.startFanout(
      knownId,
      inputValue,
      prepared.retried,
      prepared.halfOpenKey,
    );
    if (outcome.allFailed) {
      return;
    }
    await this.buildSnapshot({
      knownId,
      inputValue,
      cacheKey,
      kind,
      id,
      supporting,
      outcome,
      launchpad: { resolved: false, value: null },
      venue: {
        resolved: false,
        value: null,
        pairCreatedAt: null,
        pairAddress: null,
        pairSide: null,
      },
      skipDevHoldings: false,
      skipHoneypot: false,
      breakerSkipped: prepared.breakerSkipped,
      breakerAdmitted: prepared.breakerAdmitted,
      governor: prepared.governor,
      outcomeIsAggregate: true,
    });
  }

  /**
   * Governor read (todo 41d): pressure evaluate + tier-skip at the
   * single pre-fan-out point. Absent governor admits all (identity).
   */
  private applyGovernorTierSkip(ordered: ReadonlyArray<QuoteFetcher>): {
    readonly admitted: ReadonlyArray<QuoteFetcher>;
    readonly skipped: ReadonlyArray<string>;
    readonly note: {
      readonly key: string;
      readonly value: string;
    } | null;
  } {
    if (this.governor === null || this.governor === undefined) {
      return { admitted: ordered, skipped: [], note: null };
    }
    const openBreakers = Object.values(this.breakerStates()).filter(
      (state) => state !== 'closed',
    ).length;
    const { level, skipTiers } = this.governor.evaluate(openBreakers);
    if (level === 0 || skipTiers.length === 0) {
      return { admitted: ordered, skipped: [], note: null };
    }
    const shed = new Set<QuotaGovernorTier>(skipTiers);
    const admitted = ordered.filter(
      (fetcher) => !shed.has(quotaGovernorTierOf(fetcher.name)),
    );
    const skipped = ordered
      .filter((fetcher) => shed.has(quotaGovernorTierOf(fetcher.name)))
      .map((fetcher) => fetcher.name);
    const tierNames = [...shed].sort().join('+');
    this.logger.warn(
      `governor shed Tier-${tierNames} (${skipped.join(',') || 'none'}) at pressure L${level} — fail-open (Tier-0 live)`,
    );
    return {
      admitted,
      skipped,
      note: {
        key: `governor:shed-tier-${tierNames}`,
        value:
          `skipped ${skipped.join(',') || 'none'} at pressure L${level} ` +
          `(${openBreakers} breakers open) — Tier-0 live, fail-open`,
      },
    };
  }

  /** Governor observe (todo 41d): feed this snapshot's errors to the NEXT evaluations. */
  private observeGovernor(
    providerErrors: Readonly<Record<string, string>>,
  ): void {
    try {
      this.governor?.observe(providerErrors);
    } catch {
      // Metric-only — never throws into the serve path.
    }
  }

  /**
   * Tolerance comparator, strictly log-only (todo 22 §4): awaits the
   * already in-flight fan-out AFTER a fast serve and warns on
   * direct-vs-aggregator divergence. Never writes history/cache/
   * registry, never throws (floating promise with a catch — the
   * render already returned).
   */
  private compareToleranceInBackground(
    fanoutP: Promise<AggregationOutcome>,
    chain: string,
    address: string,
    directQuote: Partial<SnapshotQuote>,
  ): void {
    void (async () => {
      try {
        const started = performance.now();
        const outcome = await fanoutP;
        const elapsedMs = Math.round(performance.now() - started);
        const check = selectPreferredQuote(directQuote, outcome.quote);
        if (check.diverged) {
          this.logger.warn(
            `direct-fast-path tolerance diverged ` +
              `${check.divergeBps?.toFixed(1)}bps beyond ${TOLERANCE_DEFAULT_BPS}bps ` +
              `(chain=${chain} address=${address} direct=${directQuote.priceUsd} ` +
              `aggregator=${outcome.quote.priceUsd} bgFanoutMs=${elapsedMs})`,
          );
        } else {
          // Info-level (not debug): this line IS the parity metric for
          // the wire-up — exact direct-vs-aggregator pair per fast serve.
          this.logger.log(
            `direct-fast-path tolerance ok (chain=${chain} direct=${directQuote.priceUsd} ` +
              `aggregator=${outcome.quote.priceUsd} bgFanoutMs=${elapsedMs})`,
          );
        }
      } catch (err) {
        this.logger.debug(
          `direct-fast-path background fan-out failed: ${(err as Error).message}`,
        );
      }
    })();
  }

  /**
   * Snapshot tail: launchpad/venue/fdvAth/asset/dev/merge/persist/
   * cache (moved verbatim from `getSnapshot` for the fast-path seam;
   * the fallback call below passes `resolved: false` + `skipDevHoldings:
   * false`, which reproduces the old inline behavior exactly).
   */
  private async buildSnapshot(args: {
    readonly knownId: string;
    readonly inputValue: string;
    readonly cacheKey: string;
    readonly kind: string;
    readonly id: AddressIdVo;
    readonly supporting: ReadonlyArray<string>;
    readonly outcome: AggregationOutcome;
    readonly launchpad: {
      readonly resolved: boolean;
      readonly value: LaunchpadInfo | null;
    };
    readonly venue: {
      readonly resolved: boolean;
      readonly value: SnapshotVenue | null;
      /**
       * Raw best-pair creation ms handoff (dexter plan todo 63): the
       * fast path threads `fast.pairCreatedAt` (already fetched with
       * the discovery summary — zero extra calls); the fanout path
       * passes `null` and the venue tail resolves its own. Converted
       * ONCE below via `toIsoPairCreatedAt`.
       */
      readonly pairCreatedAt: number | null;
      /**
       * ATH-seed plumbing (dexter plan todo 68): raw best-pair address
       * + our side, same handoff anatomy as `pairCreatedAt` (fast path
       * threads both from its discovery summary; fanout passes nulls
       * and the venue tail resolves them). Consumed ONLY by the
       * one-shot ATH seed — never persisted, never on the wire.
       */
      readonly pairAddress: string | null;
      readonly pairSide: 'base' | 'quote' | null;
    };
    readonly skipDevHoldings: boolean;
    /**
     * Fast-path honeypot skip (dexter plan todo 71): `true` ONLY on the
     * fast-path serve (same rule as `skipDevHoldings` — the extras
     * budget belongs to the 800ms serve). When the leg was otherwise
     * runnable (mapped chain + kill-switch on + service present) the
     * skip is named in `providerErrors['honeypot:fast-path']`; chains
     * out of GoPlus scope stay silent (no call, no field, no note).
     */
    readonly skipHoneypot: boolean;
    readonly breakerSkipped: ReadonlyArray<string>;
    /**
     * Names admitted through the breaker gate for THIS snapshot's
     * aggregate. The fast path passes [] (its aggregate is still in
     * flight in background — nobody observes it, same as the registry
     * today).
     */
    readonly breakerAdmitted: ReadonlyArray<string>;
    /** Governor shed note (todo 41d): merged into `providerErrors` as ONE auditable key, or null. */
    readonly governor: {
      readonly key: string;
      readonly value: string;
    } | null;
    /**
     * True only when `outcome` is the settled aggregate (fanout path).
     * Gates the idle-success rule below: on the fast path the admitted
     * fetchers may still be in flight, so a success there would be
     * premature (it could close an open breaker with no real probe).
     */
    readonly outcomeIsAggregate: boolean;
  }): Promise<{ readonly snapshot: AddressSnapshot; readonly tailMs: number }> {
    const { knownId, inputValue, cacheKey, kind, id, supporting, outcome } =
      args;
    const tailStartedAt = performance.now();
    // Parallel tail (todo 29, deadline splits todo 35 + todo-71
    // follow-up): venue/dev race under the shared 400ms budget,
    // degrade-to-null — while launchpad (the detector) rides its OWN
    // `launchpadTailMs` deadline and honeypot its OWN `honeypotTailMs`
    // (default 1500; the GoPlus RTT loses the 400ms race) above.
    // Max SNAPSHOT_TAIL_CONCURRENCY in flight. Pre-resolved legs
    // (fast-path serve) cost zero tasks. fdvAth stays SEQUENTIAL
    // below: it is an indexed history read (no outbound, microseconds), and the read-before-save order
    // is the cold-start correctness rule (todo 16) — parallelizing it
    // would buy nothing and risk the ordering. The todo-68 one-shot
    // ATH seed rides the SAME sequential seam (marker read -> bounded
    // day fetch -> saveSeeded -> re-read), never the parallel tail.
    const tailNotes: Record<string, string> = {};
    const runExtra = async <T>(
      name: 'launchpad' | 'venue' | 'dev' | 'honeypot',
      work: Promise<T | null>,
      budgetMs: number = SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS,
    ): Promise<T | null> => {
      try {
        const raced = await withTailBudget(work, budgetMs);
        if (raced === TAIL_TIMEOUT) {
          // Every named budget prints its REAL value (venue/dev: the
          // shared 400ms default, byte-identical); launchpad names its
          // OWN detector budget (todo 35) and honeypot its own
          // `SNAPSHOT_HONEYPOT_TIMEOUT_MS` (`tail:honeypot`, todo-71
          // follow-up).
          tailNotes[`tail:${name}`] =
            name === 'launchpad'
              ? `timeout (detector budget ${budgetMs}ms) — degraded to null, fail-open`
              : `timeout (tail budget ${budgetMs}ms) — degraded to null, fail-open`;
          return null;
        }
        return raced;
      } catch {
        return null;
      }
    };
    const tailTasks: Array<() => Promise<unknown>> = [];
    const tailSlots: Array<'launchpad' | 'venue' | 'dev' | 'honeypot'> = [];
    if (!args.launchpad.resolved) {
      tailSlots.push('launchpad');
      tailTasks.push(() =>
        runExtra(
          'launchpad',
          this.resolveLaunchpad(knownId, inputValue),
          this.launchpadTailMs,
        ),
      );
    }
    if (!args.venue.resolved) {
      tailSlots.push('venue');
      tailTasks.push(() =>
        runExtra('venue', this.resolveVenue(knownId, inputValue)),
      );
    }
    const wantDev =
      kind === 'token' &&
      this.devHoldings !== null &&
      this.devHoldings !== undefined &&
      !args.skipDevHoldings;
    if (wantDev) {
      tailSlots.push('dev');
      tailTasks.push(async () => {
        try {
          return await runExtra(
            'dev',
            this.devHoldings?.resolve(knownId, inputValue) ??
              Promise.resolve(null),
          );
        } catch {
          return null;
        }
      });
    }
    // Honeypot (dexter plan todo 71, GoPlus Fase 1): chain gate FIRST —
    // only ethereum/bsc/base have a GoPlus id; every other chain
    // (solana/robinhood/arbitrum/polygon/…) stays SILENT: no call, no
    // field, no note. Then kind + fast-path + kill-switch + service
    // gates. Appended AFTER dev (slot order pinned): on a mapped-chain
    // token scan this is the 4th extra, so `runTailCapped` queues it in
    // a second wave at the SAME concurrency 3 (accepted per plan — no
    // new circuit-breaker, no concurrency increase). Its wait rides the
    // dedicated `honeypotTailMs` (default 1500, out of the shared 400ms
    // extras budget — todo-71 follow-up). Chain id computed
    // ONCE here for the task closure (and reused by the fast-path note
    // below).
    const goplusChain = goplusChainId(knownId);
    const wantHoneypot =
      kind === 'token' &&
      !args.skipHoneypot &&
      this.honeypotEnabled &&
      this.goplus !== null &&
      this.goplus !== undefined &&
      goplusChain !== null;
    if (wantHoneypot && goplusChain !== null) {
      tailSlots.push('honeypot');
      tailTasks.push(() =>
        runExtra(
          'honeypot',
          this.resolveHoneypot(goplusChain, id.key, inputValue),
          this.honeypotTailMs,
        ),
      );
    }
    const tailValues = await runTailCapped(
      tailTasks,
      SNAPSHOT_TAIL_CONCURRENCY,
    );
    let launchpad = args.launchpad.resolved ? args.launchpad.value : null;
    let venue = args.venue.resolved ? args.venue.value : null;
    // Pair-creation ms (todo 63): fast-path handoff first; the venue
    // tail below overwrites it on the fanout path (resolved:false).
    let pairCreatedAtMs: number | null = args.venue.pairCreatedAt;
    // ATH-seed plumbing (todo 68): same handoff rule as above.
    let pairAddress: string | null = args.venue.pairAddress;
    let pairSide: 'base' | 'quote' | null = args.venue.pairSide;
    let devWallets: AddressSnapshot['devWallets'] = null;
    let devPctSupply: number | null = null;
    const devErrors: Record<string, string> = {};
    // Honeypot slot (todo 71): absent when the task never ran (chain
    // gate/kill-switch/fast-path skip) — distinct from a definitive
    // absence (memoized, also absent by design).
    let honeypot: HoneypotReading | null = null;
    // LP lock/burn slot (`rick-compact-card` D3): the reading travels
    // BESIDE `honeypot` (the dexter wire shape stays `{buy,sell,sim}`)
    // and is merged null-only into the quote below.
    let lpLock: LpLockReading | null = null;
    let honeypotTransient = false;
    for (let i = 0; i < tailSlots.length; i += 1) {
      const slot = tailSlots[i];
      const value = tailValues[i];
      if (slot === 'launchpad') {
        launchpad = (value as LaunchpadInfo | null) ?? null;
      } else if (slot === 'venue') {
        const resolved = value as {
          readonly venue: SnapshotVenue | null;
          readonly pairCreatedAtMs: number | null;
          readonly pairAddress: string | null;
          readonly pairSide: 'base' | 'quote' | null;
        } | null;
        venue = resolved?.venue ?? null;
        pairCreatedAtMs = resolved?.pairCreatedAtMs ?? null;
        pairAddress = resolved?.pairAddress ?? null;
        pairSide = resolved?.pairSide ?? null;
      } else if (slot === 'honeypot') {
        // `null` here is either a runExtra timeout (note already set
        // to the tail-budget text) or an inner catch — the transient
        // flag only survives on a real transient verdict.
        const probe = value as {
          readonly reading: HoneypotReading | null;
          readonly lpLock: LpLockReading | null;
          readonly transient: boolean;
        } | null;
        honeypot = probe?.reading ?? null;
        lpLock = probe?.lpLock ?? null;
        honeypotTransient = probe?.transient === true;
      } else if (value !== null && value !== undefined) {
        const dev = value as {
          readonly devWallets?: AddressSnapshot['devWallets'];
          readonly devPctSupply?: number | null;
          readonly providerErrors?: Record<string, string>;
        };
        devWallets = dev.devWallets ?? null;
        devPctSupply = dev.devPctSupply ?? null;
        for (const [k, v] of Object.entries(dev.providerErrors ?? {})) {
          devErrors[`dev:${k}`] = v;
        }
      }
    }
    // GeckoTerminal launchpad hint (plan todo 72): LAST resort, applied
    // AFTER the tail loop so a detector positive always wins. The hint
    // is a token `/info` category id, never an origin proof — the
    // allowlist plus the chain/kind gates live HERE (the fetcher passes
    // the raw id verbatim). No suffix derivation, no venue id, no
    // override of a detector positive; `launchpadInfo` re-validates the
    // id, so a stale allowlist entry fails open to null.
    if (
      launchpad === null &&
      knownId === 'solana' &&
      kind === 'token' &&
      typeof outcome.quote.geckoLaunchpadHint === 'string' &&
      GECKO_HINT_LAUNCHPADS.has(outcome.quote.geckoLaunchpadHint)
    ) {
      launchpad = launchpadInfo(
        outcome.quote.geckoLaunchpadHint,
        knownId,
        inputValue,
      );
    }
    // Transient honeypot failure: name it under the SAME `tail:honeypot`
    // key the timeout uses (`degraded: true` either way), but ONLY when
    // the timeout note did not already claim that key — the source
    // failure text is distinct ("retries next request") and never
    // memoized.
    if (honeypotTransient && tailNotes['tail:honeypot'] === undefined) {
      tailNotes['tail:honeypot'] = HONEYPOT_TRANSIENT_NOTE;
    }
    const tailMs = Math.round(performance.now() - tailStartedAt);
    // OHLC-derived change (dexter plan todo 33): runs AFTER the tail,
    // outside the 400ms tail budget (pool discovery + one OHLC call
    // need seconds on throttled tiers — capping it would degrade the
    // leg to near-always-null). Fires only when the merged quote has
    // no native change, so healthy snapshots pay zero extra calls;
    // gap-path snapshots (already slow/pending-bound) absorb the leg.
    const derivedResolution = await this.resolveDerivedChange24h(
      knownId,
      inputValue,
      outcome.quote.priceChange24h,
      {
        priceUsd: outcome.quote.priceUsd,
        totalSupply: outcome.quote.totalSupply,
        maxSupply: outcome.quote.maxSupply,
      },
      { key: id.key, kind },
    );
    const derivedChange24h = derivedResolution.change;
    // Best-pair creation → ISO (todo 63 + plan todo 72): the ONE ms→ISO
    // step, now AFTER the derivation because the venue pick harvested
    // there can supply the fallback. DexScreener's pair keeps precedence;
    // the picked pool fills only a null (zero extra calls), and the
    // Gecko-only class stops reading honest `null`. The merged ms also
    // anchors the ATH seed (below), so an ATH can never predate the pool.
    const mergedPairCreatedAtMs =
      pairCreatedAtMs ?? derivedResolution.market?.poolCreatedAtMs ?? null;
    const pairCreatedAt = toIsoPairCreatedAt(mergedPairCreatedAtMs);
    // Venue fallback from the derivation pick (zero extra calls): the
    // OHLC-derivation leg already called `getTokenPools` +
    // `selectPoolQuote`, so its pick names the SAME pool the second
    // Gecko read in `resolveVenue` would have named. Only fills a null:
    // a real tail venue (DexScreener or Gecko) ALWAYS wins. `sources`
    // is untouched (venue is a live extra, not a persisted quote field;
    // the derivation already claims `geckoterminal` when it filled
    // quote fields).
    if (venue === null && derivedResolution.market?.dexId) {
      venue = toVenueOrNull({
        dexId: derivedResolution.market.dexId,
        labels: [],
      });
      // Honesty of `providerErrors`: the tail timed out, but the field
      // did NOT stay null — say what actually happened. A silent tail
      // failure has no note and needs none.
      const venueNote = tailNotes['tail:venue'];
      if (venueNote !== undefined && venueNote.includes('degraded to null')) {
        tailNotes['tail:venue'] = venueNote.replace(
          'degraded to null',
          'venue filled from derivation pool',
        );
      }
    }
    const baseQuote: SnapshotQuote =
      derivedChange24h === null
        ? outcome.quote
        : { ...outcome.quote, priceChange24h: derivedChange24h };
    // Venue market fill (plan todo 72, fork B): the picked pool's
    // liquidity/volume/change, written NULL-ONLY (`0` is a real reading
    // and survives). Independent of the FDV seam below; provenance is
    // appended to `sources` once when it lands.
    const venueFill = applyVenueMarketFields(
      baseQuote,
      derivedResolution.market,
    );
    const quote: SnapshotQuote = (() => {
      const merged: SnapshotQuote = venueFill.quote;
      // LP lock/burn merge (`rick-compact-card` D3): NULL-ONLY, for the
      // same reason the chain-honest merge is null-only — RugCheck
      // (Solana-only) may already carry a real value and the GoPlus
      // token-level reading must never overwrite measured data. The
      // quote is readonly, so the merged object is a NEW literal (never
      // `??=`); `sealed` and the return below consume it.
      const mergedWithLock: SnapshotQuote = {
        ...merged,
        lockedLiquidityPercent:
          merged.lockedLiquidityPercent ?? lpLock?.lockedPercent ?? null,
        burnedPercent: merged.burnedPercent ?? lpLock?.burnedPercent ?? null,
      };
      // Single-seam computed FDV (dexter plan todo 38; null-only
      // DexScreener fallback todo 61): provider-reported `fdvUsd` NEVER
      // survives as a computed value — `fdv = price×(total ?? max)`
      // with the `marketCapOf`/`isSanePrice` guard vocabulary, else
      // null; `circulating` never feeds FDV (MC input only). NULL-ONLY
      // fallback: when (and only when) the computed product is null,
      // the seam serves the dedicated `dexscreenerFdvUsd` leg field
      // (written by the dexscreener fetcher alone — the generic merged
      // `fdvUsd` is never a fallback source, Gecko lesson), tagged
      // `fdvProvenance: 'dexscreener'`; a healthy computed value wins
      // ALWAYS (WENCAT/INCOME byte-identical; the Solana fast path
      // carries no DSC payload → unchanged). MC is recomputed as
      // `price×circ` when `circ` is present (no MC>FDV cards); when
      // `circ` is absent the merged MC is kept (mint supply ~=
      // circulating for most SPL mints, so MC≈FDV for fixed supply —
      // same pattern as `marketCapOf` in direct-fast-path.service.ts).
      const sealed = applyComputedFdv(mergedWithLock);
      if (
        sealed.reportedFdvUsd !== null &&
        (sealed.fdvUsd === null ||
          Math.abs(sealed.reportedFdvUsd - sealed.fdvUsd) >
            computedFdvEpsilonBound(sealed.fdvUsd ?? sealed.reportedFdvUsd))
      ) {
        this.logger.debug(
          `computed-fdv discarded provider-reported fdv ` +
            `chain=${knownId} address=${inputValue} ` +
            `reported=${sealed.reportedFdvUsd} served=${sealed.fdvUsd} ` +
            `provenance=${sealed.fdvProvenance}`,
        );
      }
      if (
        sealed.marketCapRecomputed &&
        sealed.reportedMarketCapUsd !== null &&
        sealed.reportedMarketCapUsd !== sealed.marketCapUsd
      ) {
        this.logger.debug(
          `computed-fdv recohered marketCap ` +
            `chain=${knownId} address=${inputValue} ` +
            `reported=${sealed.reportedMarketCapUsd} computed=${sealed.marketCapUsd}`,
        );
      }
      return {
        ...mergedWithLock,
        fdvUsd: sealed.fdvUsd,
        marketCapUsd: sealed.marketCapUsd,
        fdvProvenance: sealed.fdvProvenance,
      };
    })();
    const derivedSource = derivedResolution.source;
    const sources = (() => {
      const next = [...outcome.sources];
      if (derivedChange24h !== null && derivedSource !== null) {
        next.push(derivedSource);
      }
      // Venue-fill provenance (plan todo 72): the numbers came from the
      // GeckoTerminal pool, so name it — ONCE (a contributing gecko
      // fetcher may already have added it) and never as `-ohlcv` (no
      // candle series was fetched on this path).
      if (venueFill.applied && !next.includes('geckoterminal')) {
        next.push('geckoterminal');
      }
      return next.length === outcome.sources.length ? outcome.sources : next;
    })();
    // A derived change rescues an otherwise field-less aggregate: the
    // snapshot carries one honest live field, so stale replay and the
    // pending status both stand down for it.
    const quoteFailed = outcome.allFailed && derivedChange24h === null;
    // FDV ATH is strictly historical: read BEFORE the current row is
    // persisted, so cold-start (no history) resolves null and the
    // in-flight FDV is never substituted as ATH (spec-pinned).
    //
    // ONE-SHOT HISTORICAL SEED (dexter plan todo 68): the anti-masking
    // guard is the `geckoterminal-ath-seed` MARKER on any row of this
    // token — NOT `ath === null` (the todo-46 hour backfill already
    // seeds candle rows before this read, so null would mask the seed
    // forever). Marker absent -> ONE bounded attempt (`seedFdvAthHistory`,
    // fail-open, negative-memo for definitive absences): it writes the
    // peak day candle (`max(high) x supply`, stamped candle-open+1ms)
    // BEFORE this read, so a first sight serves the historical ATH in
    // the SAME response. Existing tokens get the same one-time attempt
    // (owner decision 2026-10-18). The re-read is an indexed history
    // read (no outbound, microseconds) and only runs when a row landed.
    const athLookup = await this.history.findFdvAth(knownId, inputValue);
    let fdvAth = athLookup.ath;
    if (!athLookup.seeded) {
      const seededRows = await this.seedFdvAthHistory({
        key: id.key,
        chain: knownId,
        address: inputValue,
        kind,
        totalSupply: quote.totalSupply,
        maxSupply: quote.maxSupply,
        pairAddress,
        pairSide,
        pairCreatedAtMs: mergedPairCreatedAtMs,
      });
      if (seededRows > 0) {
        fdvAth = (await this.history.findFdvAth(knownId, inputValue)).ath;
      }
    }
    // Clamp ATH >= current, ONLY when reachable (todo 68; amended
    // read-before-save rule below): an EXISTING ATH never displays
    // below the in-flight FDV (max-only, never retrocedes) — a new
    // peak being observed live. `ath === null` (cold-start, no seed)
    // stays null: the clamp NEVER invents an ATH.
    if (
      fdvAth !== null &&
      typeof quote.fdvUsd === 'number' &&
      Number.isFinite(quote.fdvUsd) &&
      quote.fdvUsd > fdvAth.fdvUsd
    ) {
      fdvAth = { fdvUsd: quote.fdvUsd, at: new Date().toISOString() };
    }
    const knownFetcherNames = new Set(
      this.providers.listProviders().map((provider) => provider.name),
    );
    for (const source of sources) {
      this.providers.recordSuccess(source, 0);
      // Breaker observes TRANSPORT failures only (todo 29): a source
      // that contributed is a success by definition. Unknown names
      // (e.g. `onchain-direct` on the fast path) are not fetchers and
      // never touch the breaker — same guard the registry applies via
      // its descriptor map.
      if (knownFetcherNames.has(source)) {
        const key = snapshotBreakerKey(source);
        const before = this.breaker?.getState(key);
        this.breaker?.recordSuccess(key);
        if (before !== undefined && before !== null && before !== 'closed') {
          this.logger.log(`breaker closed: ${source}`);
        }
      }
    }
    // Failure recording is ONE path (dexter plan todo 19b3): the
    // registry ticks its telemetry counters AND relays the transport
    // failure to the shared breaker under the same `snapshotBreakerKey`
    // this gate reads. `'no data'` stays the conservative blind spot
    // and unknown names keep the registry's descriptor parity skip —
    // both documented on `ProviderRegistryService.recordFailure`. The
    // success side stays direct below (idle-success has no registry
    // counterpart — documented asymmetry).
    for (const name of Object.keys(outcome.errors)) {
      if (!sources.includes(name)) {
        this.providers.recordFailure(name, outcome.errors[name]);
      }
    }
    // Idle-success (fanout path only): an admitted fetcher that ran
    // clean but contributed NOTHING (another fetcher won every field)
    // is transport-healthy — the half-open probe it carried PROVED the
    // provider is back, so the breaker closes. Contribution-based
    // success above would leave the breaker half-open forever when a
    // recovered provider keeps losing the merge. (Registry keeps its
    // pre-existing sources-only accounting — untouched.)
    if (args.outcomeIsAggregate) {
      for (const name of args.breakerAdmitted) {
        if (!knownFetcherNames.has(name)) {
          continue;
        }
        if (sources.includes(name) || name in outcome.errors) {
          continue;
        }
        const key = snapshotBreakerKey(name);
        const before = this.breaker?.getState(key);
        this.breaker?.recordSuccess(key);
        if (before !== undefined && before !== null && before !== 'closed') {
          this.logger.log(`breaker closed: ${name}`);
        }
      }
    }
    const providerErrors: Record<string, string> = { ...outcome.errors };
    for (const name of args.breakerSkipped) {
      providerErrors[name] =
        'breaker skip (open 30s cool-off or half-open probe busy) — fail-open (resets on deploy)';
    }
    if (args.governor !== null) {
      providerErrors[args.governor.key] = args.governor.value;
    }
    for (const [k, v] of Object.entries(tailNotes)) {
      providerErrors[k] = v;
    }
    // Public-RPC rotation audit (dexter plan todo 42): backoff
    // enter/exit notes ride the existing providerErrors channel (same
    // seam the governor/breaker read — no new metrics, no parallel
    // control loop). Drain-once per snapshot; null fastPath drains none.
    if (this.fastPath !== null && this.fastPath !== undefined) {
      const rotationNotes = this.fastPath.drainRotationNotes?.() ?? [];
      for (const note of rotationNotes) {
        providerErrors[note.key] = note.value;
      }
    }
    if (args.skipDevHoldings && kind === 'token') {
      // Fast card: dev holdings need their own aggregator round trip,
      // outside the 800ms budget by design — marked, never silent.
      providerErrors['dev:fast-path'] = 'skipped (fast-path budget)';
    }
    if (
      args.skipHoneypot &&
      kind === 'token' &&
      this.honeypotEnabled &&
      this.goplus !== null &&
      this.goplus !== undefined &&
      goplusChain !== null
    ) {
      // Fast card: the honeypot tail leg did not run — marked with the
      // SAME semantics as `dev:fast-path` (`degraded: true`). Chains
      // out of GoPlus scope (solana/robinhood/…) stay silent: the gate
      // above answers false there.
      providerErrors['honeypot:fast-path'] = 'skipped (fast-path budget)';
    }
    for (const [k, v] of Object.entries(devErrors)) {
      providerErrors[k] = v;
    }
    // Serve-stale floor (dexter plan todo 19b1, NO background
    // refresh by design): the request that finds providers down
    // replays the newest ready history row WITH the stale bit; the
    // NEXT request retries providers naturally (stale is never
    // cached, never re-persisted — see below). No cron/queue/timer/
    // fire-and-forget exists on this path, so the stampede and
    // unhandled-rejection classes are absent by construction.
    if (quoteFailed && devWallets === null) {
      const staleRow = await this.history.findLatestReady(
        id.key,
        kind,
        this.staleMaxAgeMs,
      );
      if (staleRow !== null) {
        const staleAsOf = staleRow.createdAt;
        const staleAgeMs = Date.now() - Date.parse(staleRow.createdAt);
        // Trio guard (todo 41c `no-bit-without-age`): a corrupt row
        // (unparseable timestamp) falls through to honest pending —
        // never a bit with no age.
        if (isStaleTrioValid(true, staleAsOf, staleAgeMs)) {
          const stale: AddressSnapshot = {
            chain: id.chain,
            address: id.address,
            kind: id.kind,
            key: id.key,
            status: 'ready',
            stale: true,
            staleAsOf,
            staleAgeMs,
            degraded: isTailDegraded(providerErrors),
            assetId: await this.resolveAssetId(
              knownId,
              inputValue,
              staleRow.quote,
            ),
            launchpad,
            venue,
            pairCreatedAt,
            honeypot,
            fdvAth,
            providers: supporting,
            sources: [...staleRow.sources],
            providerErrors,
            ...emptySnapshotQuote(),
            ...staleRow.quote,
            devWallets: staleRow.quote.devWallets ?? null,
            devPctSupply: staleRow.quote.devPctSupply ?? null,
          };
          // A real history row is serving: the pending streak ends.
          this.aging?.clear(id.key, kind);
          return { snapshot: stale, tailMs };
        }
      }
      // Pending aging (dexter plan todo 21d): N consecutive pendings
      // within the window escalate to a differentiated `invalid`
      // instead of pending-forever. The entry is KEPT on escalation
      // (further pendings re-escalate until fresh data — or a
      // definitive existence verdict — clears it). Only pending
      // serves record; the background refresh never does.
      if (this.aging !== null && this.aging !== undefined) {
        const verdict = this.aging.record(id.key, kind);
        if (verdict.escalated) {
          this.logger.log(
            `pending-aging chain=${knownId} address=${inputValue} kind=${kind} ` +
              `count=${verdict.count} escalated=true — serving invalid`,
          );
          const invalid = this.buildInvalidCard({
            id,
            supporting,
            providerErrors: {
              ...providerErrors,
              aging: agingEscalationNote(
                verdict.count,
                this.aging.escalationWindowMs,
              ),
            },
          });
          await this.persistInvalid(invalid, cacheKey);
          return { snapshot: invalid, tailMs };
        }
      }
    }
    // Identity provenance + metadata last resort (dexter plan todo
    // 39): the fast path pins the source when IT names the token
    // (kept verbatim — never re-derived here). Otherwise the merged
    // quote decides: named by providers -> 'market'; unnamed Solana
    // token -> ONE lazy metadata read (post-merge, so no provider
    // data is ever shadowed; identity-less healthy path pays zero).
    // A metadata hit fills symbol/name ONLY — supply/holders/price
    // stay aggregator-owned (numbers N/A stay honest), and the card
    // status is untouched (a market-less hit still reads `pending`).
    const metadataIdentity =
      outcome.quote.identityProvenance !== null &&
      outcome.quote.identityProvenance !== undefined
        ? null
        : await this.resolveMetadataIdentity(
            knownId,
            kind,
            inputValue,
            quote,
            providerErrors,
          );
    const resolvedQuote: SnapshotQuote =
      metadataIdentity === null
        ? {
            ...quote,
            identityProvenance:
              outcome.quote.identityProvenance ??
              (quote.symbol !== null || quote.name !== null ? 'market' : null),
          }
        : {
            ...quote,
            symbol: metadataIdentity.symbol ?? quote.symbol,
            name: metadataIdentity.name ?? quote.name,
            identityProvenance: 'metadata',
          };
    const snapshot: AddressSnapshot = {
      chain: id.chain,
      address: id.address,
      kind: id.kind,
      key: id.key,
      status: quoteFailed && devWallets === null ? 'pending' : 'ready',
      stale: false,
      staleAsOf: null,
      staleAgeMs: null,
      degraded: isTailDegraded(providerErrors),
      assetId: await this.resolveAssetId(knownId, inputValue, resolvedQuote),
      launchpad,
      venue,
      pairCreatedAt,
      honeypot,
      fdvAth,
      providers: supporting,
      sources,
      providerErrors,
      ...emptySnapshotQuote(),
      ...resolvedQuote,
      devWallets,
      devPctSupply,
    };
    // Fresh data is serving: any pending streak for this key ends
    // (dexter plan todo 21d clear site; the aging-escalated invalid
    // above deliberately does NOT clear — it re-escalates).
    if (snapshot.status === 'ready') {
      this.aging?.clear(id.key, kind);
    }
    await this.history.save({
      key: snapshot.key,
      chain: snapshot.chain,
      address: snapshot.address,
      kind: snapshot.kind,
      status: snapshot.status,
      quote: {
        ...resolvedQuote,
        devWallets,
        devPctSupply,
      },
      sources,
      providerErrors,
    });
    if (this.cache && snapshot.status !== 'pending') {
      // Robust-nulls (plan todo 19a): pending snapshots are NEVER
      // cached — a cached pending shell freezes a transient miss for
      // the full TTL (P12: `x-cache: HIT`, zero provider traffic).
      // The store honors any TTL (`CachePort.set` takes `ttlSeconds`,
      // in-memory applies it verbatim), so skip-write needs no
      // short-TTL fallback. History still persists pending rows (19b
      // SWR + fdvAth read them). Stale-served snapshots never reach
      // this line (early return above: no re-persist, no cache write
      // — the bound window never re-anchors and the next request
      // retries providers).
      await this.cache.set(cacheKey, snapshot, SNAPSHOT_CACHE_TTL_SECONDS);
    }
    if (snapshot.status === 'pending') {
      this.nullMetrics?.record(
        deriveSnapshotNullReason({ servedFromCache: false, providerErrors }),
      );
    }
    return { snapshot, tailMs };
  }
}
