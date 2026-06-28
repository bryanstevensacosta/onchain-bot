import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { ChainRegistryModule } from 'chain/registry/chain-registry.module';
import { MarketDataProviderPort } from 'token/enrichment/domain/ports/market-data-provider.port';
import { DexScreenerAdapter } from 'token/enrichment/infrastructure/providers/dexscreener.adapter';
import { GeckoTerminalAdapter } from 'token/enrichment/infrastructure/providers/geckoterminal.adapter';
import { BirdeyeAdapter } from 'token/enrichment/infrastructure/providers/birdeye.adapter';
import { CoinGeckoAdapter } from 'token/enrichment/infrastructure/providers/coingecko.adapter';
import { CoinMarketCapAdapter } from 'token/enrichment/infrastructure/providers/coinmarketcap.adapter';
import { HeliusAdapter } from 'token/enrichment/infrastructure/providers/helius.adapter';
import { MobulaAdapter } from 'token/enrichment/infrastructure/providers/mobula.adapter';
import { MoralisAdapter } from 'token/enrichment/infrastructure/providers/moralis.adapter';
import { RugCheckAdapter } from 'token/enrichment/infrastructure/providers/rugcheck.adapter';
import { SolanaRpcAdapter } from 'token/enrichment/infrastructure/providers/solana-rpc.adapter';
import { MARKET_DATA_PROVIDERS } from 'token/enrichment/enrichment.tokens';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';
import { EnrichmentEventPublisher } from 'token/enrichment/application/ports/enrichment-event.publisher';
import { EnrichTokenUseCase } from 'token/enrichment/application/handlers/enrich-token.use-case';
import { GetSnapshotUseCase } from 'token/enrichment/application/handlers/get-snapshot.use-case';
import { ListSnapshotsUseCase } from 'token/enrichment/application/handlers/list-snapshots.use-case';
import { InMemoryTokenSnapshotRepository } from 'token/enrichment/infrastructure/repositories/in-memory-token-snapshot.repository';
import { TokenSnapshotEntity } from 'token/enrichment/infrastructure/persistence/typeorm/entities/token-snapshot.entity';
import { TypeOrmTokenSnapshotRepository } from 'token/enrichment/infrastructure/persistence/typeorm/repositories/typeorm-token-snapshot.repository';
import { InProcessEnrichmentEventPublisher } from 'token/enrichment/infrastructure/messaging/in-process-enrichment-event.publisher';
import { CallNormalizedHandler } from 'token/enrichment/infrastructure/event-bus/call-normalized.handler';
import { EnrichmentController } from 'token/enrichment/api/http/enrichment.controller';
import { TokenImageController } from 'token/enrichment/api/http/token-image.controller';
import { TokenImageService } from 'token/enrichment/application/services/token-image.service';
import { TOKEN_IMAGE_FETCHER } from 'token/enrichment/application/ports/token-image.fetcher';
import { TokenImageFetcher as TokenImageFetcherImpl } from 'token/enrichment/infrastructure/fetchers/token-image.fetcher';
import {
  LruTokenImageCache,
  TOKEN_IMAGE_CACHE,
} from 'shared/cache/token-image-cache.adapter';

/**
 * Chain Explorer BC module.
 *
 * Provides third-party market data adapters AND the enrichment pipeline:
 * - DexScreenerAdapter (chain-agnostic, free)
 * - GeckoTerminalAdapter (chain-aware via registry, free)
 * - CoinMarketCapAdapter (symbol-based fallback, Basic plan)
 * - CoinGeckoAdapter (price/MC/FDV fallback, 100+ platforms)
 * - BirdeyeAdapter (Solana-only via defensive guard, premium)
 * - HeliusAdapter (Solana-only via defensive guard, DAS holders count)
 * - MobulaAdapter (concentration metrics, 6 chains)
 * - MoralisAdapter (holders EVM, 5 chains)
 *
 * Exports `MARKET_DATA_PROVIDERS` token for downstream consumers, plus
 * the enrichment repository and event publisher for classification/scoring.
 */
@Module({
  imports: [
    ChainRegistryModule,
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([TokenSnapshotEntity])]
      : []),
  ],
  controllers: [EnrichmentController, TokenImageController],
  providers: [
    CoinMarketCapAdapter,
    DexScreenerAdapter,
    GeckoTerminalAdapter,
    CoinGeckoAdapter,
    CoinMarketCapAdapter,
    BirdeyeAdapter,
    HeliusAdapter,
    MobulaAdapter,
    MoralisAdapter,
    RugCheckAdapter,
    SolanaRpcAdapter,
    TokenImageService,
    {
      provide: TOKEN_IMAGE_FETCHER,
      useClass: TokenImageFetcherImpl,
    },
    {
      provide: TOKEN_IMAGE_CACHE,
      useClass: LruTokenImageCache,
    },
    {
      provide: MARKET_DATA_PROVIDERS,
      useFactory: (
        dex: DexScreenerAdapter,
        gt: GeckoTerminalAdapter,
        cg: CoinGeckoAdapter,
        cmc: CoinMarketCapAdapter,
        birdeye: BirdeyeAdapter,
        helius: HeliusAdapter,
        mobula: MobulaAdapter,
        moralis: MoralisAdapter,
        rugcheck: RugCheckAdapter,
        solanaRpc: SolanaRpcAdapter,
      ): ReadonlyArray<MarketDataProviderPort> => [
        dex,
        gt,
        cg,
        cmc,
        birdeye,
        helius,
        mobula,
        moralis,
        rugcheck,
        solanaRpc,
      ],
      inject: [
        DexScreenerAdapter,
        GeckoTerminalAdapter,
        CoinGeckoAdapter,
        CoinMarketCapAdapter,
        BirdeyeAdapter,
        HeliusAdapter,
        MobulaAdapter,
        MoralisAdapter,
        RugCheckAdapter,
        SolanaRpcAdapter,
      ],
    },
    EnrichTokenUseCase,
    GetSnapshotUseCase,
    ListSnapshotsUseCase,
    CallNormalizedHandler,
    InMemoryTokenSnapshotRepository,
    ...(isDatabaseEnabled() ? [TypeOrmTokenSnapshotRepository] : []),
    {
      provide: TokenSnapshotRepository,
      inject: [
        InMemoryTokenSnapshotRepository,
        ...(isDatabaseEnabled() ? [TypeOrmTokenSnapshotRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryTokenSnapshotRepository,
        typeorm?: TypeOrmTokenSnapshotRepository,
      ): TokenSnapshotRepository => typeorm ?? inMemory,
    },
    {
      provide: EnrichmentEventPublisher,
      useClass: InProcessEnrichmentEventPublisher,
    },
  ],
  exports: [
    MARKET_DATA_PROVIDERS,
    TokenSnapshotRepository,
    EnrichmentEventPublisher,
    EnrichTokenUseCase,
  ],
})
export class EnrichmentModule {}
