import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { ChainRegistryModule } from 'chain/registry/chain-registry.module';
import { MarketDataProviderPort } from 'chain/explorer/domain/ports/market-data-provider.port';
import { DexScreenerAdapter } from 'chain/explorer/infrastructure/providers/dexscreener.adapter';
import { GeckoTerminalAdapter } from 'chain/explorer/infrastructure/providers/geckoterminal.adapter';
import { BirdeyeAdapter } from 'chain/explorer/infrastructure/providers/birdeye.adapter';
import { HeliusAdapter } from 'chain/explorer/infrastructure/providers/helius.adapter';
import { RugCheckAdapter } from 'chain/explorer/infrastructure/providers/rugcheck.adapter';
import { SolanaRpcAdapter } from 'chain/explorer/infrastructure/providers/solana-rpc.adapter';
import { MARKET_DATA_PROVIDERS } from 'chain/explorer/chain-explorer.tokens';
import { TokenSnapshotRepository } from 'chain/explorer/application/ports/token-snapshot.repository';
import { EnrichmentEventPublisher } from 'chain/explorer/application/ports/enrichment-event.publisher';
import { EnrichTokenUseCase } from 'chain/explorer/application/handlers/enrich-token.use-case';
import { GetSnapshotUseCase } from 'chain/explorer/application/handlers/get-snapshot.use-case';
import { ListSnapshotsUseCase } from 'chain/explorer/application/handlers/list-snapshots.use-case';
import { InMemoryTokenSnapshotRepository } from 'chain/explorer/infrastructure/repositories/in-memory-token-snapshot.repository';
import { TokenSnapshotEntity } from 'chain/explorer/infrastructure/persistence/typeorm/entities/token-snapshot.entity';
import { TypeOrmTokenSnapshotRepository } from 'chain/explorer/infrastructure/persistence/typeorm/repositories/typeorm-token-snapshot.repository';
import { InProcessEnrichmentEventPublisher } from 'chain/explorer/infrastructure/messaging/in-process-enrichment-event.publisher';
import { CallNormalizedHandler } from 'chain/explorer/infrastructure/event-bus/call-normalized.handler';
import { EnrichmentController } from 'chain/explorer/api/http/enrichment.controller';

/**
 * Chain Explorer BC module.
 *
 * Provides third-party market data adapters AND the enrichment pipeline:
 * - DexScreenerAdapter (chain-agnostic, free)
 * - GeckoTerminalAdapter (chain-aware via registry, free)
 * - BirdeyeAdapter (Solana-only via defensive guard, premium)
 * - HeliusAdapter (Solana-only via defensive guard, DAS holders count)
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
  controllers: [EnrichmentController],
  providers: [
    DexScreenerAdapter,
    GeckoTerminalAdapter,
    BirdeyeAdapter,
    HeliusAdapter,
    RugCheckAdapter,
    SolanaRpcAdapter,
    {
      provide: MARKET_DATA_PROVIDERS,
      useFactory: (
        dex: DexScreenerAdapter,
        gt: GeckoTerminalAdapter,
        birdeye: BirdeyeAdapter,
        helius: HeliusAdapter,
        rugcheck: RugCheckAdapter,
        solanaRpc: SolanaRpcAdapter,
      ): ReadonlyArray<MarketDataProviderPort> => [
        dex,
        gt,
        birdeye,
        helius,
        rugcheck,
        solanaRpc,
      ],
      inject: [
        DexScreenerAdapter,
        GeckoTerminalAdapter,
        BirdeyeAdapter,
        HeliusAdapter,
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
export class ChainExplorerModule {}
