import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { resolveDexScreenerSlug } from 'provider/infrastructure/dexscreener/dexscreener.service';
import type {
  DexScreenerPair,
  DexScreenerPairSummary,
} from 'provider/infrastructure/dexscreener/dexscreener.types';
import { DiscoveryCacheRepository } from '../infrastructure/discovery-cache.repository';

/**
 * Pair → summary mapper (dexter plan todo 30b).
 *
 * Byte-equivalent to the private `toPairSummary` inside
 * `DexScreenerService` (same reductions, same null rules). It lives
 * HERE — not imported — because the provider file is read-only for
 * this lane (30a owns tiers/providers) and the function is private
 * there. If that mapper ever changes shape, this one must follow
 * (both are pinned by specs on the same fixture shape).
 */
function toSummaryFromTripwire(pair: DexScreenerPair): DexScreenerPairSummary {
  const vol24h = Object.values(pair.volume).reduce((sum, v) => sum + v, 0);
  const txns24h = pair.txns?.['h24'] ?? { buys: 0, sells: 0 };
  return {
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    labels: [...(pair.labels ?? [])],
    baseToken: { ...pair.baseToken },
    quoteToken: {
      address: pair.quoteToken?.address ?? null,
      name: pair.quoteToken?.name ?? null,
      symbol: pair.quoteToken?.symbol ?? null,
    },
    priceUsd: pair.priceUsd,
    priceNative: pair.priceNative,
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24h: vol24h,
    fdv: pair.fdv,
    marketCap: pair.marketCap,
    priceChange24h: pair.priceChange?.['h24'] ?? null,
    txns24h,
  };
}

/**
 * Discovery cache service (dexter plan todo 30b — the `resolveDiscovery`
 * seam; this file is the worker-named home for the cache
 * delete + resolve methods the task requires).
 *
 * Discovery (`token-pairs/v1/<chain>/<mint>`, measured 640–978ms) is
 * cached SEPARATELY from the numbers: one DB row per `(chain, mint)`
 * holding `{pairAddress, dexId}`. Prices/liquidity are NEVER served
 * from this cache — on a hit the numbers come from the tripwire pair
 * itself (live), so a hit costs exactly 1 HTTP and zero discovery.
 *
 * TRIPWIRE (pinned): the existing
 * `DexScreenerService.getPairByAddress(chainId, pairAddress)` —
 * signature verified `(chainId: string, pairAddress: string)`, exactly
 * 1 HTTP (`GET /latest/dex/pairs/{chainId}/{pairAddress}`), NO
 * re-discovery inside. If the tripwire pair's `dexId` matches the
 * cached `dexId`, the pair is still live and the cached discovery
 * stands.
 *
 * INVALIDATION (three ways, all fail-open toward re-discovery):
 * (i) tripwire `dexId` disagrees with the cache (or the tripwire
 * answers null — dead pair and transient error are
 * indistinguishable here because the method collapses both to null,
 * so null re-discovers; worst case one extra discovery call);
 * (ii) an on-chain reader reports `migrated: true` (DBC confirmed —
 * graduated curve → pool; other families are backstopped by the
 * tripwire) → the reader path calls `invalidateDiscovery(chain,
 * mint)` (the `resolveDiscovery → cache delete(chain,mint)` seam)
 * and the NEXT scan re-discovers + re-pins (promote-once);
 * (iii) the 30d lazy TTL (`DiscoveryCacheRepository.find` deletes +
 * answers null past the bound; the janitor prunes unread rows).
 *
 * SEPARATION (pinned): this service returns `DexScreenerPairSummary`
 * (venue/discovery vocabulary) and NOTHING else. Cached `dexId`
 * NEVER flows into `launchpad.id` (origin vocabulary,
 * `launchpad-info.ts`) — separate tables, separate seams, asserted
 * by spec in both directions.
 */
@Injectable()
export class DiscoveryCacheService {
  private readonly logger = new Logger(DiscoveryCacheService.name);

  public constructor(
    private readonly cache: DiscoveryCacheRepository,
    @Optional()
    @Inject(DexScreenerService)
    private readonly dexscreener: DexScreenerService | null = null,
  ) {}

  /**
   * Resolve the best-pair discovery for `(chain, mint)`, cache-first.
   *
   * Miss (empty / TTL-expired / tripwire-mismatch / tripwire-null) →
   * full `getBestPairSummaryForChain` + pin on success (null
   * discoveries are NEVER pinned — an honest empty must re-probe
   * next scan, same rule as the 19a no-negative-cache). Hit →
   * tripwire-verified summary, zero `token-pairs` calls.
   */
  public async resolveDiscovery(
    chain: string,
    address: string,
  ): Promise<DexScreenerPairSummary | null> {
    const slug = resolveDexScreenerSlug((chain ?? '').trim());
    if (slug === null) return null;
    if (this.dexscreener === null || this.dexscreener === undefined) {
      return null;
    }
    const cached = await this.cache.find(chain, address);
    if (cached !== null) {
      // Tripwire: exactly ONE `getPairByAddress` HTTP — never a
      // `token-pairs` discovery. The 2nd-scan spec pins both halves
      // (tripwire called once, discovery called zero times). The
      // capability check is fail-open for partial DexScreenerService
      // surfaces (legacy hand-mocks without the tripwire method):
      // no tripwire means no verification, so re-discover rather
      // than serve an unverified row.
      const canTripwire =
        typeof this.dexscreener.getPairByAddress === 'function';
      const live = canTripwire
        ? await this.dexscreener
            .getPairByAddress(slug, cached.pairAddress)
            .catch(() => null)
        : null;
      if (live !== null && live.dexId === cached.dexId) {
        return toSummaryFromTripwire(live);
      }
      // (i) mismatch or null-tripwire: drop the row and fall through
      // to re-discovery (fail-open — a transient tripwire error costs
      // one discovery call, never a wrong pool).
      await this.cache.delete(chain, address);
      this.logger.debug(
        `discovery-cache tripwire miss (chain=${chain} live=${live === null ? 'null' : live.dexId} cached=${cached.dexId}) — re-discovering`,
      );
    }
    let discovered: DexScreenerPairSummary | null = null;
    try {
      discovered = await this.dexscreener.getBestPairSummaryForChain(
        chain,
        address,
      );
    } catch {
      return null;
    }
    if (discovered === null) return null;
    await this.cache.save(
      chain,
      address,
      discovered.pairAddress,
      discovered.dexId,
    );
    return discovered;
  }

  /**
   * Invalidation seam (dexter plan todo 30b (ii)): the on-chain reader
   * path calls this when a pool view reports `migrated: true`
   * (graduated curve → pool). The row is dropped NOW; the next scan's
   * `resolveDiscovery` miss re-discovers the pool address and re-pins
   * (promote-once + re-pin — never a second delete for the same
   * graduation, because the re-pinned row carries the pool's dexId).
   */
  public async invalidateDiscovery(
    chain: string,
    address: string,
  ): Promise<void> {
    await this.cache.delete(chain, address);
  }
}
