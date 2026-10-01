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
import { CcxtService } from 'provider/infrastructure/ccxt';
import { CoinGeckoService } from 'provider/infrastructure/coingecko';
import { MobulaService } from 'provider/infrastructure/mobula';
import { MoralisService } from 'provider/infrastructure/moralis';
import { RugCheckService } from 'provider/infrastructure/rugcheck';
import { SolanaRpcService } from 'provider/infrastructure/solana-rpc';
import { AddressSnapshotService } from './application/address-snapshot.service';
import { SnapshotHistoryJanitorService } from './application/snapshot-history-janitor.service';
import { HoldersModule } from '../holders/holders.module';
import { AggregatorsModule } from 'aggregators/aggregators.module';
import { AssetRegistryModule } from 'asset-registry/asset-registry.module';
import { SNAPSHOT_QUOTE_PROVIDERS } from './domain/snapshot-quote.types';
import { buildProviderQuoteFetchers } from 'provider/infrastructure/quote-fetchers/provider-quote.fetchers';
import { SnapshotHistoryEntity } from './infrastructure/snapshot-history.entity';
import { SnapshotHistoryRepository } from './infrastructure/snapshot-history.repository';

/**
 * SnapshotModule (Tramo 3, todo 12, P50; market-data restructure:
 * aggregation moved to AggregatorsModule — this module owns history
 * persistence only, plus the thin pipeline orchestrator).
 *
 * The orchestrator (`AddressSnapshotService`) runs the pipeline —
 * address resolve -> cache-first -> aggregators policy order ->
 * provider fetch (token-bucket) -> merge -> history persist ->
 * cache set — consuming chain/provider ports, the address kind
 * detector, the aggregation policy + merge from AggregatorsModule, and
 * dev holdings through `DevHoldingsPort`; delivery stays in gateway/
 * (P43). The live fan-out runs over thin `QuoteFetcher` wrappers
 * around the canonical adapters (imported via `ProvidersModule` —
 * adapters themselves untouched), each gated by its per-provider
 * outbound token bucket (registry `rateLimitPerMin`, fail-open with an
 * explicit error on deny). History persists to `snapshot_history` when
 * `DATABASE_ENABLED=true` (TypeORM entity + 90d janitor); otherwise
 * the v1 in-memory ring.
 */
@Module({
  imports: [
    AddressModule,
    ChainModule,
    ProviderModule,
    ProvidersModule,
    HoldersModule,
    AggregatorsModule,
    AssetRegistryModule,
    RateLimiterModule,
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([SnapshotHistoryEntity])]
      : []),
  ],
  providers: [
    AddressSnapshotService,
    SnapshotHistoryJanitorService,
    SnapshotHistoryRepository,
    {
      provide: SNAPSHOT_QUOTE_PROVIDERS,
      inject: [
        DexScreenerService,
        GeckoTerminalService,
        BirdeyeService,
        CcxtService,
        CoinGeckoService,
        MobulaService,
        MoralisService,
        RugCheckService,
        SolanaRpcService,
      ],
      useFactory: (
        dexscreener: DexScreenerService,
        geckoterminal: GeckoTerminalService,
        birdeye: BirdeyeService,
        ccxt: CcxtService,
        coingecko: CoinGeckoService,
        mobula: MobulaService,
        moralis: MoralisService,
        rugcheck: RugCheckService,
        solanaRpc: SolanaRpcService,
      ) =>
        buildProviderQuoteFetchers({
          dexscreener,
          geckoterminal,
          birdeye,
          ccxt,
          coingecko,
          mobula,
          moralis,
          rugcheck,
          solanaRpc,
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
