import { Injectable } from '@nestjs/common';

/**
 * Quota governor tiers (dexter plan todo 41d — ONE governor).
 *
 * - Tier 0 (never shed): the primary keyless discovery+price legs.
 *   Shedding Tier-0 would leave no card at all — their walls are
 *   absorbed by the outbound buckets + retry cap + breaker + stale
 *   replay instead (pinned, not hoped).
 * - Tier 1 (shed at pressure L2): secondary free legs.
 * - Tier 2 (shed at pressure L1): keyed legs with monthly-budget
 *   quotas (Birdeye CU, CoinGecko/CMC credits) — the first to go
 *   because a monthly budget hard-exhausts while per-minute keyless
 *   walls self-heal.
 *
 * Unknown fetcher names default to Tier 1 (middle: neither
 * last-resort nor first-shed) — new legs get pinned here explicitly
 * by their owners. The discovery cache rides INSIDE the dexscreener
 * fetcher (tripwire-verified, quota-SAVING) and is never shed
 * separately — shedding it would INCREASE load.
 */
export type QuotaGovernorTier = 0 | 1 | 2;

export const QUOTA_GOVERNOR_TIER: Readonly<Record<string, QuotaGovernorTier>> =
  {
    dexscreener: 0,
    geckoterminal: 0,
    'solana-rpc': 1,
    rugcheck: 1,
    defillama: 1,
    ccxt: 1,
    birdeye: 2,
    coingecko: 2,
    mobula: 2,
    moralis: 2,
    etherscan: 2,
  };

export function quotaGovernorTierOf(name: string): QuotaGovernorTier {
  return QUOTA_GOVERNOR_TIER[name] ?? 1;
}

/** Pressure level: 0 normal, 1 shed Tier-2, 2 Tier-0-only. */
export type GovernorLevel = 0 | 1 | 2;

/** Fetchers shed at each level (Tier-0 is never shed). */
export function governorShedTiers(
  level: GovernorLevel,
): ReadonlyArray<QuotaGovernorTier> {
  if (level === 2) return [1, 2];
  if (level === 1) return [2];
  return [];
}

/**
 * Pressure thresholds (pinned defaults, env-overridable — same
 * pattern as the stale bound; non-finite/<=0 fall back to default).
 *
 * HEADROOM MATH (todo 41, 2026-10-11 — full table in the notepad):
 * binding free ceilings are GeckoTerminal ~10/min and DexScreener
 * 60/min against ~3 calls per cold scan, i.e. Tier-0 alone saturates
 * at ~3-20 cold snapshots/min. Current load is ~2 cold/min, so 10x
 * (20/min) EXCEEDS Tier-0 — the invariant is BOUNDED (declared, not
 * hoped): sustained cold demand past ~10 MISS/min sheds Tier-2, past
 * ~90 MISS/min serves Tier-0-only + stale replays + honest pending.
 * The 30s edge cache absorbs repeats (HIT = 0 quota), so MISS rate —
 * not request rate — is the signal the governor reads.
 */
export const GOVERNOR_L1_OPEN_BREAKERS = 2;
export const GOVERNOR_L2_OPEN_BREAKERS = 4;
export const GOVERNOR_L1_QUOTA_EVENTS_PER_MIN = 10;
export const GOVERNOR_L2_QUOTA_EVENTS_PER_MIN = 30;
export const GOVERNOR_L1_MISS_PER_MIN = 30;
export const GOVERNOR_L2_MISS_PER_MIN = 90;

function resolvePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number((raw ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export interface GovernorThresholds {
  readonly l1OpenBreakers: number;
  readonly l2OpenBreakers: number;
  readonly l1QuotaEventsPerMin: number;
  readonly l2QuotaEventsPerMin: number;
  readonly l1MissPerMin: number;
  readonly l2MissPerMin: number;
}

export function resolveGovernorThresholds(
  env: NodeJS.ProcessEnv,
): GovernorThresholds {
  return {
    l1OpenBreakers: resolvePositiveInt(
      env['GOVERNOR_L1_OPEN_BREAKERS'],
      GOVERNOR_L1_OPEN_BREAKERS,
    ),
    l2OpenBreakers: resolvePositiveInt(
      env['GOVERNOR_L2_OPEN_BREAKERS'],
      GOVERNOR_L2_OPEN_BREAKERS,
    ),
    l1QuotaEventsPerMin: resolvePositiveInt(
      env['GOVERNOR_L1_QUOTA_EVENTS_PER_MIN'],
      GOVERNOR_L1_QUOTA_EVENTS_PER_MIN,
    ),
    l2QuotaEventsPerMin: resolvePositiveInt(
      env['GOVERNOR_L2_QUOTA_EVENTS_PER_MIN'],
      GOVERNOR_L2_QUOTA_EVENTS_PER_MIN,
    ),
    l1MissPerMin: resolvePositiveInt(
      env['GOVERNOR_L1_MISS_PER_MIN'],
      GOVERNOR_L1_MISS_PER_MIN,
    ),
    l2MissPerMin: resolvePositiveInt(
      env['GOVERNOR_L2_MISS_PER_MIN'],
      GOVERNOR_L2_MISS_PER_MIN,
    ),
  };
}

export interface GovernorSignal {
  readonly openBreakers: number;
  readonly quotaEventsPerMin: number;
  readonly missPerMin: number;
}

/** Pure pressure mapping (spec-pinned matrix — no clock, no state). */
export function governorLevelFor(
  signal: GovernorSignal,
  thresholds: GovernorThresholds,
): GovernorLevel {
  if (
    signal.openBreakers >= thresholds.l2OpenBreakers ||
    signal.quotaEventsPerMin >= thresholds.l2QuotaEventsPerMin ||
    signal.missPerMin >= thresholds.l2MissPerMin
  ) {
    return 2;
  }
  if (
    signal.openBreakers >= thresholds.l1OpenBreakers ||
    signal.quotaEventsPerMin >= thresholds.l1QuotaEventsPerMin ||
    signal.missPerMin >= thresholds.l1MissPerMin
  ) {
    return 1;
  }
  return 0;
}

/**
 * Quota-ish providerErrors values the governor counts as pressure
 * (rolling 60s window). `tail:*` (latency, not quota) and
 * `governor:*` (own audit notes — counting them would latch the shed
 * ON forever) are EXCLUDED by key; everything else with a quota
 * signature counts (outbound-deny text, 429s, rate-limit/Retry-After
 * notes that leak through adapters).
 */
const QUOTA_EVENT_PATTERN =
  /429|retry-after|budget exceeded|rate.?limit|quota|too many/i;

export function isGovernorQuotaEvent(key: string, value: string): boolean {
  if (key.startsWith('governor:') || key.startsWith('tail:')) return false;
  return QUOTA_EVENT_PATTERN.test(value);
}

/**
 * QuotaGovernorService (dexter plan todo 41d — the ONE governor).
 *
 * Read in `getSnapshot` BEFORE the fan-out (after the cache check —
 * HITs cost zero quota and never consult it); every other call-site
 * (edges, batch) funnels through `getSnapshot` and checks NOTHING
 * itself. Signal = own rolling MISS counter (the outbound estimate:
 * MISS/min x per-scan cost, math in the threshold comment) + breaker
 * state (open count, passed in) + 429/quota-event metric (observed
 * post-build from `providerErrors`). Actuator = tier-skip at that
 * point + `providerErrors['governor:shed-tier-N']` audit note naming
 * the skipped fetchers and the reason. Fail-open everywhere: pressure
 * 0 admits all; a shed snapshot still merges every admitted leg.
 * In-memory rolling windows + reset-on-deploy ACCEPTED (same rule as
 * the breaker — documented, not hidden).
 */
const GOVERNOR_WINDOW_MS = 60_000;

@Injectable()
export class QuotaGovernorService {
  private readonly thresholds: GovernorThresholds = resolveGovernorThresholds(
    process.env,
  );
  private missAt: Array<number> = [];
  private quotaEventAt: Array<number> = [];

  private prune(now: number): void {
    const cutoff = now - GOVERNOR_WINDOW_MS;
    this.missAt = this.missAt.filter((at) => at > cutoff);
    this.quotaEventAt = this.quotaEventAt.filter((at) => at > cutoff);
  }

  /**
   * Evaluate pressure BEFORE the fan-out. Records this MISS (call it
   * exactly once per cache-MISS snapshot) and returns the level + the
   * tiers to skip. Pure from the caller's view besides the counters.
   */
  public evaluate(
    openBreakers: number,
    now: number = Date.now(),
  ): {
    readonly level: GovernorLevel;
    readonly skipTiers: ReadonlyArray<QuotaGovernorTier>;
  } {
    this.prune(now);
    this.missAt.push(now);
    const level = governorLevelFor(
      {
        openBreakers,
        quotaEventsPerMin: this.quotaEventAt.length,
        missPerMin: this.missAt.length,
      },
      this.thresholds,
    );
    return { level, skipTiers: governorShedTiers(level) };
  }

  /** Feed the NEXT evaluations: scan a built snapshot's `providerErrors`. */
  public observe(
    providerErrors: Readonly<Record<string, string>>,
    now: number = Date.now(),
  ): void {
    if (providerErrors === null || typeof providerErrors !== 'object') {
      return;
    }
    this.prune(now);
    for (const [key, value] of Object.entries(providerErrors)) {
      if (isGovernorQuotaEvent(key, value)) {
        this.quotaEventAt.push(now);
      }
    }
  }

  /** Rolling state (specs + future `/metrics` exporter). */
  public snapshot(now: number = Date.now()): {
    readonly missPerMin: number;
    readonly quotaEventsPerMin: number;
    readonly level: GovernorLevel;
  } {
    this.prune(now);
    return {
      missPerMin: this.missAt.length,
      quotaEventsPerMin: this.quotaEventAt.length,
      level: governorLevelFor(
        {
          openBreakers: 0,
          quotaEventsPerMin: this.quotaEventAt.length,
          missPerMin: this.missAt.length,
        },
        this.thresholds,
      ),
    };
  }
}
