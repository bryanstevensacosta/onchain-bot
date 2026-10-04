import { Injectable, Logger } from '@nestjs/common';

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

export function toFdvAthAtOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null;
  return Number.isNaN(Date.parse(raw)) ? null : raw;
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
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly totalSupply: number | null;
  readonly circulatingSupply: number | null;
  readonly maxSupply: number | null;
  readonly devWallets: ReadonlyArray<DevWalletSnapshot> | null;
  readonly devPctSupply: number | null;
  readonly status: string | null;
  readonly launchpad?: MarketDataLaunchpad | null;
  readonly venue?: MarketDataVenue | null;
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
    const parsed = Number(process.env.MARKET_DATA_TIMEOUT_MS ?? 2000);
    this.timeoutMs = Number.isNaN(parsed) ? 2000 : parsed;
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
        launchpad: toLaunchpadOrNull(body.launchpad),
        venue: toVenueOrNull(body.venue),
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
