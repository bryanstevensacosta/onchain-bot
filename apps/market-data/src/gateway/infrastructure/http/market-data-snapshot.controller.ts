import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from 'cache/infrastructure/cache.interceptor';
import { CacheTTL } from 'cache/infrastructure/cache-ttl.decorator';
import { AddressSnapshotService } from 'snapshot/application/address-snapshot.service';
import { GatewayRateLimitGuard } from '../../application/gateway-rate-limit.guard';
import { RequireScope } from 'auth/application/require-scope.decorator';

/**
 * Market-data snapshot compat edge (Tramo 3, todo 5, G-17; enriched
 * todo-3 gap).
 *
 * `GET /api/market-data/snapshot?chain=&address=` — the exact contract
 * the kol-system `HttpMarketDataAdapter` already calls. Returns the
 * 12 kol-system `MarketData` fields (live-merged, first-non-null across
 * the supporting providers; null + explicit `status: 'pending'` with
 * per-provider `providerErrors` only when every provider failed) plus
 * the address echo (`chain/address/kind/key/status/providers`).
 *
 * Chain qualifier is mandatory (blank → 404, unknown chain → 404 via
 * the snapshot service — never a silent null to the client). Edge
 * policies mirror `AddressesController` (P43): global x-api-key auth,
 * 60/min rate-limit, 30s cache (the SLO layer for p95<500ms).
 */
@UseGuards(GatewayRateLimitGuard)
@UseInterceptors(CacheInterceptor)
@RequireScope('snapshot')
@Controller('api/market-data')
export class MarketDataSnapshotController {
  public constructor(private readonly snapshots: AddressSnapshotService) {}

  @Get('snapshot')
  @CacheTTL(30)
  public async getSnapshot(
    @Query('chain') chain: string,
    @Query('address') address: string,
  ): Promise<Record<string, unknown>> {
    const snap = await this.snapshots.getSnapshot({
      chain,
      value: address,
      kindHint: 'token',
    });
    return {
      priceUsd: snap.priceUsd,
      liquidityUsd: snap.liquidityUsd,
      volume24hUsd: snap.volume24hUsd,
      marketCapUsd: snap.marketCapUsd,
      fdvUsd: snap.fdvUsd,
      priceChange24h: snap.priceChange24h,
      holders: snap.holders,
      top10HolderPercent: snap.top10HolderPercent,
      symbol: snap.symbol,
      name: snap.name,
      lockedLiquidityPercent: snap.lockedLiquidityPercent,
      burnedPercent: snap.burnedPercent,
      chain: snap.chain,
      address: snap.address,
      kind: snap.kind,
      key: snap.key,
      status: snap.status,
      providers: snap.providers,
      sources: snap.sources,
      providerErrors: snap.providerErrors,
    };
  }
}
