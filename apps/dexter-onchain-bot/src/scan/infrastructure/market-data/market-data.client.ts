import { Injectable, Logger } from '@nestjs/common';

/**
 * Default per-call budget for market-data HTTP (env
 * `MARKET_DATA_TIMEOUT_MS`). Cold market-data fan-out takes ~2s
 * (parallel providers, 8s each); Telegram tolerates ~60s per update,
 * so 10s covers cold aggregates with wide headroom while still
 * failing fast. The old 2s budget truncated slow-but-successful
 * cold scans into `null` → `not-found` (root-cause P14 race).
 */
const DEFAULT_MARKET_DATA_TIMEOUT_MS = 10_000;

/**
 * market-data HTTP client (Tramo 3, todo 9, P13 — NEW).
 *
 * The ONLY market-data source for dexter-onchain-bot (todo 5 bridge,
 * default-true here): `GET {baseUrl}/api/market-data/snapshot` (the
 * exact compat edge the backend `HttpMarketDataAdapter` already calls)
 * with `x-api-key` when `MARKET_DATA_API_KEY` is set (fail-open empty =
 * keyless dev). Every failure resolves null with a warn — the caller
 * reports an explicit message, never a silent partial card.
 */

export interface DevWalletSnapshot {
  readonly wallet: string;
  readonly holdAmount: number | null;
  readonly percentOfSupply: number | null;
  readonly pnlUsd: number | null;
  readonly tag: string | null;
  readonly probable?: boolean;
}

/**
 * Origin launchpad of a token (dexter-launchpad, Lane S). Mirrors
 * market-data `LaunchpadInfo` + the domain `LaunchpadInfo` in
 * `scan/domain/ports/scan-pipeline.port.ts`: `{id, name, url}` or
 * `null` when no launchpad was detected. NEVER trusted blindly —
 * `toLaunchpadOrNull` shape-checks at this boundary (all three
 * strings non-empty, else null) so opaque JSON never reaches the
 * renderer.
 */
export interface MarketDataLaunchpad {
  readonly id: string;
  readonly name: string;
  readonly url: string;
}

export function toLaunchpadOrNull(raw: unknown): MarketDataLaunchpad | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  const { id, name, url } = candidate;
  if (
    typeof id !== 'string' ||
    id === '' ||
    typeof name !== 'string' ||
    name === '' ||
    typeof url !== 'string' ||
    url === ''
  ) {
    return null;
  }
  return { id, name, url };
}

/**
 * DEX venue of the best-liquidity pair (dexter venue-line, plan
 * todo 14). Mirrors market-data `SnapshotVenue`: `{ dexId, labels }`
 * or `null`. NEVER trusted blindly — `toVenueOrNull` shape-checks at
 * this boundary (dexId a non-empty string, labels an array of
 * strings, else null) so opaque JSON never reaches the renderer.
 * `dexId` (e.g. `meteoradbc`) is never treated as a launchpad id
 * (e.g. `meteora-dbc`) — separate tables, separate validators.
 */
export interface MarketDataVenue {
  readonly dexId: string;
  readonly labels: ReadonlyArray<string>;
}

export function toVenueOrNull(raw: unknown): MarketDataVenue | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  const { dexId, labels } = candidate;
  if (typeof dexId !== 'string' || dexId.trim() === '') return null;
  if (!Array.isArray(labels)) return null;
  const clean = labels.filter(
    (entry): entry is string => typeof entry === 'string',
  );
  return { dexId: dexId.trim(), labels: clean };
}

/**
 * Honey-tax / simulation reading of the best pair (dexter 🍯 row,
 * plan todo 71 PASO 1). Mirrors market-data `HoneypotReading`:
 * `{ buy, sell, sim }` with taxes as PERCENT (0-100) and `sim` the
 * simulation verdict — `'ok' | 'fail' | null` (`null` = Fase 1,
 * external-source reading only, no SIM claim). NEVER trusted
 * blindly — `toHoneypotOrNull` shape-checks at this boundary:
 * every side must be absent/`null` or a finite number within 0-100,
 * `sim` must be exactly `'ok'`/`'fail'`/`null`/absent; ANY violation
 * resolves the whole object to `null` so opaque JSON never reaches
 * the renderer. Arrays are rejected too: a honeypot reading is a
 * RECORD — an array (or any other non-record) is a contract
 * violation, never an all-null reading.
 */
export interface MarketDataHoneypot {
  readonly buy: number | null;
  readonly sell: number | null;
  readonly sim: 'ok' | 'fail' | null;
}

function taxSideOrNull(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  if (raw < 0 || raw > 100) return undefined;
  return raw;
}

export function toHoneypotOrNull(raw: unknown): MarketDataHoneypot | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const buy = taxSideOrNull(candidate.buy);
  const sell = taxSideOrNull(candidate.sell);
  if (buy === undefined || sell === undefined) return null;
  const rawSim = candidate.sim;
  if (
    rawSim !== undefined &&
    rawSim !== null &&
    rawSim !== 'ok' &&
    rawSim !== 'fail'
  ) {
    return null;
  }
  return {
    buy,
    sell,
    sim: rawSim === 'ok' || rawSim === 'fail' ? rawSim : null,
  };
}

/**
 * Holders concentration for the Rick-parity `👥 TH:` row (plan
 * dexter-rick-compact-card §10.5-§10.7). Solana-only: `topPercents`
 * is the merge-by-wallet top list, NON-INCREASING (ties valid),
 * 0..5 entries (`[]` = the object exists but the row must stay
 * silent — not malformed), each 0-100 (% of total supply).
 * `top10Percent` sums the top-10 of the SAME filtered list in the
 * SAME order under the SAME denominator, so
 * `sum(topPercents) <= top10Percent` holds by construction; the ε
 * absorbs dexter's re-accumulation, never a serialization gap.
 *
 * NEVER trusted blindly — `toHolderConcentrationOrNull` shape-checks
 * at this boundary (any violation resolves the WHOLE object to
 * `null`) so opaque JSON never reaches the renderer.
 */
export interface MarketDataHolderConcentration {
  readonly topPercents: ReadonlyArray<number>;
  readonly top10Percent: number;
}

/**
 * Coherence epsilon for the TH guard, in PERCENTAGE POINTS. The same
 * literal is pinned in market-data's spec: the two apps share no
 * package (dexter never imports market-data source), so the contract
 * keeps them in sync — do NOT reuse the FDV-scoped epsilon family.
 */
const HOLDER_SUM_EPSILON = 1e-9;

export function toHolderConcentrationOrNull(
  raw: unknown,
): MarketDataHolderConcentration | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const percents = candidate.topPercents;
  const top10 = candidate.top10Percent;
  if (!Array.isArray(percents) || percents.length > 5) return null;
  const clean: number[] = [];
  for (const entry of percents) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return null;
    if (entry < 0 || entry > 100) return null;
    if (clean.length > 0 && clean[clean.length - 1] < entry) return null;
    clean.push(entry);
  }
  if (typeof top10 !== 'number' || !Number.isFinite(top10)) return null;
  if (top10 < -HOLDER_SUM_EPSILON || top10 > 100 + HOLDER_SUM_EPSILON) {
    return null;
  }
  const sum = clean.reduce((total, entry) => total + entry, 0);
  if (sum > top10 + HOLDER_SUM_EPSILON) return null;
  return { topPercents: clean, top10Percent: top10 };
}

/**
 * FDV ATH over the token's own snapshot history (dexter fdv-ath,
 * plan todo 16). Two flat fields, each validated at this boundary:
 * `fdvAthUsd` must be a finite number, `fdvAthAt` an ISO-parseable
 * string — anything else resolves `null` so opaque JSON never
 * reaches the renderer. Both `null` on cold-start (no history);
 * the current FDV is NEVER substituted (spec-pinned).
 */
export function toFdvAthUsdOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * 1-hour window numbers (dexter `{{market1hRow}}`, Rick parity):
 * `volume1hUsd` / `priceChange1h` must be FINITE numbers — anything
 * else (absent on older market-data answers, string, NaN, Infinity)
 * resolves `null` so the renderer silences the whole row instead of
 * printing a guess.
 */
export function toFiniteNumberOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * 1-hour transaction counts (`txns1hBuys` / `txns1hSells`): finite
 * AND `>= 0` — a negative or non-finite count is garbage, never data
 * to round-trip. Absent reads `null` (row silenced by the renderer).
 */
export function toNonNegativeCountOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? raw
    : null;
}

export function toFdvAthAtOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null;
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

/**
 * Serve-stale trio (dexter plan todo 19b1): `stale` is `true` ONLY
 * when market-data replayed history (fan-out failed) — anything but
 * boolean `true` reads `false`, so older market-data answers
 * (field absent) stay fresh-shaped. `staleAsOf` reuses the ISO rule;
 * `staleAgeMs` must be a finite number >= 0, else `null`.
 */
export function toStaleOrFalse(raw: unknown): boolean {
  return raw === true;
}

export function toStaleAsOfOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null;
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

export function toStaleAgeMsOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? raw
    : null;
}

/**
 * Tail-degraded marker (dexter plan todo 41b): `degraded` is `true`
 * ONLY when market-data served the card without tail extras — anything
 * but boolean `true` reads `false`, so older market-data answers
 * (field absent) stay full-shaped.
 */
export function toDegradedOrFalse(raw: unknown): boolean {
  return raw === true;
}

/**
 * Identity provenance (dexter plan todo 39): `'market'` (providers /
 * discovery pair side) or `'metadata'` (on-chain Metaplex PDA, last
 * resort). Anything else (absent on older market-data answers,
 * garbage) reads `null` — the pipeline defaults it to `'market'`
 * (legacy = market identity; only an explicit `'metadata'` marks).
 */
export function toIdentityProvenanceOrNull(
  raw: unknown,
): 'market' | 'metadata' | null {
  return raw === 'market' || raw === 'metadata' ? raw : null;
}

/**
 * Best-pair creation time (dexter `{{age}}`, plan todo 63): top-level
 * ISO string from market-data (`AddressSnapshot.pairCreatedAt`), or
 * `null`. Same rule as `toFdvAthAtOrNull` — a non-empty ISO-parseable
 * string, else `null`, so opaque JSON never reaches the renderer.
 * This is PAIR age (best-liquidity pool), never token deploy age: a
 * migration under-reports (documented proxy caveat). The renderer
 * formats it with the shared compact-age formatter, never a fork.
 */
export function toPairCreatedAtOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null;
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

/**
 * Bonding-curve state of a launchpad token (dexter launchpad layout,
 * 2026-10-30). Mirrors market-data's frozen wire shape:
 * `{ onCurve, launchpadId, quoteSymbol, quoteMint, progressPercent }`.
 *
 * NEVER trusted blindly — `toBondingCurveOrNull` shape-checks at this
 * boundary and resolves the WHOLE object to `null` on any violation:
 * non-object/array, `onCurve !== true` (only a verified on-curve token
 * qualifies), a non-string/empty `launchpadId`, a present
 * `quoteSymbol`/`quoteMint` that is not a non-empty string, or a
 * present `progressPercent` that is not a finite number in [0, 100].
 * Absent/null optional members normalize to `null`.
 */
export interface MarketDataBondingCurve {
  readonly onCurve: boolean;
  readonly launchpadId: string;
  readonly quoteSymbol: string | null;
  readonly quoteMint: string | null;
  readonly progressPercent: number | null;
}

/**
 * Optional string member: absent/`null` reads `null`, a non-empty
 * string passes through, anything else is a contract violation
 * (sentinel `undefined`).
 */
function optionalNonEmptyStringOrUndefined(
  raw: unknown,
): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || raw === '') return undefined;
  return raw;
}

export function toBondingCurveOrNull(
  raw: unknown,
): MarketDataBondingCurve | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.onCurve !== true) return null;
  if (
    typeof candidate.launchpadId !== 'string' ||
    candidate.launchpadId === ''
  ) {
    return null;
  }
  const quoteSymbol = optionalNonEmptyStringOrUndefined(candidate.quoteSymbol);
  const quoteMint = optionalNonEmptyStringOrUndefined(candidate.quoteMint);
  if (quoteSymbol === undefined || quoteMint === undefined) return null;
  const rawProgress = candidate.progressPercent;
  let progressPercent: number | null = null;
  if (rawProgress !== null && rawProgress !== undefined) {
    if (typeof rawProgress !== 'number' || !Number.isFinite(rawProgress)) {
      return null;
    }
    if (rawProgress < 0 || rawProgress > 100) return null;
    progressPercent = rawProgress;
  }
  return {
    onCurve: true,
    launchpadId: candidate.launchpadId,
    quoteSymbol,
    quoteMint,
    progressPercent,
  };
}

export interface MarketDataSnapshot {
  readonly chain: string;
  readonly address: string;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly priceUsd: number | null;
  readonly priceChange24h: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly lockedLiquidityPercent: number | null;
  readonly burnedPercent: number | null;
  readonly volume24hUsd: number | null;
  /**
   * 1-hour window (dexter `{{market1hRow}}`, Rick parity): 1h volume,
   * 1h price change (%) and the buy/sell transaction counts of that
   * window. Optional on the wire — validated here by
   * `toFiniteNumberOrNull` / `toNonNegativeCountOrNull` (violation
   * reads `null`; the renderer silences the row when any is absent).
   */
  readonly volume1hUsd?: number | null;
  readonly priceChange1h?: number | null;
  readonly txns1hBuys?: number | null;
  readonly txns1hSells?: number | null;
  /**
   * 5-minute window (dexter `{{market5mRow}}` / `{{marketRow}}`,
   * launchpad layout): the same four measures on the 5-minute window,
   * validated exactly like the 1h ones (`toFiniteNumberOrNull` /
   * `toNonNegativeCountOrNull`). Absent on older answers.
   */
  readonly volume5mUsd?: number | null;
  readonly priceChange5m?: number | null;
  readonly txns5mBuys?: number | null;
  readonly txns5mSells?: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly totalSupply: number | null;
  readonly circulatingSupply: number | null;
  readonly maxSupply: number | null;
  readonly devWallets: ReadonlyArray<DevWalletSnapshot> | null;
  readonly devPctSupply: number | null;
  readonly status: string | null;
  readonly stale?: boolean | null;
  readonly staleAsOf?: string | null;
  readonly staleAgeMs?: number | null;
  readonly degraded?: boolean | null;
  readonly launchpad?: MarketDataLaunchpad | null;
  readonly venue?: MarketDataVenue | null;
  /**
   * Bonding-curve state (dexter launchpad layout, 2026-10-30), frozen
   * wire contract owned by market-data. Validated by
   * `toBondingCurveOrNull` at this boundary — any violation reads
   * `null` (the launchpad keys then stay silent).
   */
  readonly bondingCurve?: MarketDataBondingCurve | null;
  /**
   * Honey-tax / simulation reading (dexter 🍯 row, plan todo 71):
   * `{ buy, sell, sim }` (%, 0-100) or `null`/absent (chain without a
   * source, non-token kind, older answers). Validated by
   * `toHoneypotOrNull` at this boundary — any violation reads `null`.
   */
  readonly honeypot?: MarketDataHoneypot | null;
  /**
   * Holders concentration (dexter `{{holderTopRow}}`, plan
   * dexter-rick-compact-card §10.5-§10.7): `{ topPercents,
   * top10Percent }` or `null`/absent (non-Solana, no source, fast
   * path, malformed). Shape-checked by `toHolderConcentrationOrNull`
   * at this boundary — any violation reads `null` (full silence).
   */
  readonly holderConcentration?: MarketDataHolderConcentration | null;
  /**
   * Best-pair creation ISO (dexter `{{age}}`, plan todo 63), top-level
   * on the market-data snapshot. Validated by `toPairCreatedAtOrNull`
   * at this boundary; absent/null on cold-start or older answers.
   */
  readonly pairCreatedAt?: string | null;
  readonly identityProvenance?: 'market' | 'metadata' | null;
  readonly fdvAthUsd?: number | null;
  readonly fdvAthAt?: string | null;
}

export interface ChainDetectHit {
  readonly chainId: string;
  readonly points: number;
  readonly reasons: ReadonlyArray<string>;
}

@Injectable()
export class MarketDataClient {
  private readonly logger = new Logger(MarketDataClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  public constructor() {
    this.baseUrl = process.env.MARKET_DATA_URL ?? 'http://localhost:4000';
    this.apiKey = process.env.MARKET_DATA_API_KEY ?? '';
    const parsed = Number(
      process.env.MARKET_DATA_TIMEOUT_MS ?? DEFAULT_MARKET_DATA_TIMEOUT_MS,
    );
    this.timeoutMs = Number.isNaN(parsed)
      ? DEFAULT_MARKET_DATA_TIMEOUT_MS
      : parsed;
  }

  public async getSnapshot(
    chain: string,
    address: string,
  ): Promise<MarketDataSnapshot | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url =
        `${this.baseUrl}/api/market-data/snapshot` +
        `?chain=${encodeURIComponent(chain)}` +
        `&address=${encodeURIComponent(address)}`;
      const headers: Record<string, string> =
        this.apiKey === '' ? {} : { 'x-api-key': this.apiKey };
      const res = await fetch(url, { signal: controller.signal, headers });
      if (!res.ok) {
        this.logger.warn(`market-data responded ${res.status} — null`);
        return null;
      }
      const body = (await res.json()) as Partial<MarketDataSnapshot>;
      return {
        chain: typeof body.chain === 'string' ? body.chain : chain,
        address: typeof body.address === 'string' ? body.address : address,
        symbol: body.symbol ?? null,
        name: body.name ?? null,
        priceUsd: body.priceUsd ?? null,
        priceChange24h: body.priceChange24h ?? null,
        marketCapUsd: body.marketCapUsd ?? null,
        fdvUsd: body.fdvUsd ?? null,
        liquidityUsd: body.liquidityUsd ?? null,
        lockedLiquidityPercent: body.lockedLiquidityPercent ?? null,
        burnedPercent: body.burnedPercent ?? null,
        volume24hUsd: body.volume24hUsd ?? null,
        volume1hUsd: toFiniteNumberOrNull(body.volume1hUsd),
        priceChange1h: toFiniteNumberOrNull(body.priceChange1h),
        txns1hBuys: toNonNegativeCountOrNull(body.txns1hBuys),
        txns1hSells: toNonNegativeCountOrNull(body.txns1hSells),
        volume5mUsd: toFiniteNumberOrNull(body.volume5mUsd),
        priceChange5m: toFiniteNumberOrNull(body.priceChange5m),
        txns5mBuys: toNonNegativeCountOrNull(body.txns5mBuys),
        txns5mSells: toNonNegativeCountOrNull(body.txns5mSells),
        holders: body.holders ?? null,
        top10HolderPercent: body.top10HolderPercent ?? null,
        totalSupply: body.totalSupply ?? null,
        circulatingSupply: body.circulatingSupply ?? null,
        maxSupply: body.maxSupply ?? null,
        devWallets: Array.isArray(body.devWallets)
          ? (body.devWallets as ReadonlyArray<DevWalletSnapshot>)
          : null,
        devPctSupply:
          typeof body.devPctSupply === 'number' ? body.devPctSupply : null,
        status: body.status ?? null,
        stale: toStaleOrFalse(body.stale),
        staleAsOf: toStaleAsOfOrNull(body.staleAsOf),
        staleAgeMs: toStaleAgeMsOrNull(body.staleAgeMs),
        degraded: toDegradedOrFalse(body.degraded),
        launchpad: toLaunchpadOrNull(body.launchpad),
        venue: toVenueOrNull(body.venue),
        bondingCurve: toBondingCurveOrNull(body.bondingCurve),
        honeypot: toHoneypotOrNull(body.honeypot),
        holderConcentration: toHolderConcentrationOrNull(
          body.holderConcentration,
        ),
        pairCreatedAt: toPairCreatedAtOrNull(body.pairCreatedAt),
        identityProvenance: toIdentityProvenanceOrNull(body.identityProvenance),
        fdvAthUsd: toFdvAthUsdOrNull(body.fdvAthUsd),
        fdvAthAt: toFdvAthAtOrNull(body.fdvAthAt),
      };
    } catch (err) {
      this.logger.warn(
        `market-data fetch failed (${err instanceof Error ? err.message : 'unknown'}) — null`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Chain-detect reuse (market-data `GET /api/v1/chains/detect`, read-only
   * reference to `DetectChainService`): format-level chain hint for a bare
   * address. Every failure resolves null with a warn — the caller falls
   * back to the solana-first sweep, never a silent guess.
   */
  public async detectChain(address: string): Promise<ChainDetectHit | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url =
        `${this.baseUrl}/api/v1/chains/detect` +
        `?address=${encodeURIComponent(address)}`;
      const headers: Record<string, string> =
        this.apiKey === '' ? {} : { 'x-api-key': this.apiKey };
      const res = await fetch(url, { signal: controller.signal, headers });
      if (!res.ok) {
        this.logger.warn(`chain-detect responded ${res.status} — null`);
        return null;
      }
      const body = (await res.json()) as Partial<ChainDetectHit>;
      if (typeof body.chainId !== 'string' || body.chainId === '') {
        return null;
      }
      return {
        chainId: body.chainId,
        points: typeof body.points === 'number' ? body.points : 0,
        reasons: Array.isArray(body.reasons)
          ? (body.reasons as ReadonlyArray<string>)
          : [],
      };
    } catch (err) {
      this.logger.warn(
        `chain-detect fetch failed (${err instanceof Error ? err.message : 'unknown'}) — null`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
