import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AddressModule } from 'address/address.module';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { ProvidersModule } from 'provider/infrastructure/providers.module';
import { RateLimiterModule } from 'rate-limiter/rate-limiter.module';
import { isDatabaseEnabled } from 'shared/infrastructure/config/database.config';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { MoralisService } from 'provider/infrastructure/moralis';
import { RugCheckService } from 'provider/infrastructure/rugcheck';
import { AddressSnapshotService } from './application/address-snapshot.service';
import { SnapshotAggregatorService } from './application/snapshot-aggregator.service';
import { SnapshotHistoryJanitorService } from './application/snapshot-history-janitor.service';
import { SNAPSHOT_QUOTE_PROVIDERS } from './domain/snapshot-quote.types';
import {
  buildProviderQuoteFetchers,
} from './infrastructure/provider-quote.fetchers';
import { SnapshotHistoryEntity } from './infrastructure/snapshot-history.entity';
import { SnapshotHistoryRepository } from './infrastructure/snapshot-history.repository';

/**
 * SnapshotModule (Tramo 3, todo 12, P50; live aggregation todo-3 gap;
 * persistent history + outbound budgets todo 14, GAP-1).
 *
 * Canonical home of snapshot aggregation (moved from AddressModule —
 * P45 placed it under address/, P50 promotes it to its own module so
 * every module follows domain/ + application/ + infrastructure/).
 * The service consumes chain/provider ports plus the address kind
 * detector; delivery stays in gateway/ (P43). The live fan-out runs
 * over thin `QuoteFetcher` wrappers around the canonical adapters
 * (imported via `ProvidersModule` — adapters themselves untouched),
 * each gated by its per-provider outbound token bucket (registry
 * `rateLimitPerMin`, fail-open with an explicit error on deny).
 * History persists to `snapshot_history` when `DATABASE_ENABLED=true`
 * (TypeORM entity + 90d janitor); otherwise the v1 in-memory ring.
 */
@Module({
  imports: [
    AddressModule,
    ChainModule,
    ProviderModule,
    ProvidersModule,
    RateLimiterModule,
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([SnapshotHistoryEntity])]
      : []),
  ],
  providers: [
    AddressSnapshotService,
    SnapshotAggregatorService,
    SnapshotHistoryJanitorService,
    SnapshotHistoryRepository,
    {
      provide: SNAPSHOT_QUOTE_PROVIDERS,
      inject: [
        DexScreenerService,
        GeckoTerminalService,
        BirdeyeService,
        MoralisService,
        RugCheckService,
      ],
      useFactory: (
        dexscreener: DexScreenerService,
        geckoterminal: GeckoTerminalService,
        birdeye: BirdeyeService,
        moralis: MoralisService,
        rugcheck: RugCheckService,
      ) =>
        buildProviderQuoteFetchers({
          dexscreener,
          geckoterminal,
          birdeye,
          moralis,
          rugcheck,
        }),
    },
  ],
  exports: [
    AddressSnapshotService,
    SnapshotHistoryJanitorService,
    SnapshotHistoryRepository,
  ],
})
export class SnapshotModule {}
