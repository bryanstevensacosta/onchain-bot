import { Module } from '@nestjs/common';
import { MarketDataProviderPort } from 'discovery/enrichment/domain/ports/market-data-provider.port';
import { TokenSnapshotRepository } from 'discovery/enrichment/application/ports/token-snapshot.repository';
import { EnrichmentEventPublisher } from 'discovery/enrichment/application/ports/enrichment-event.publisher';
import { EnrichTokenUseCase } from 'discovery/enrichment/application/handlers/enrich-token.use-case';
import { GetSnapshotUseCase } from 'discovery/enrichment/application/handlers/get-snapshot.use-case';
import { ListSnapshotsUseCase } from 'discovery/enrichment/application/handlers/list-snapshots.use-case';
import { DexScreenerAdapter } from 'discovery/enrichment/infrastructure/providers/dexscreener.adapter';
import { GeckoTerminalAdapter } from 'discovery/enrichment/infrastructure/providers/geckoterminal.adapter';
import { BirdeyeAdapter } from 'discovery/enrichment/infrastructure/providers/birdeye.adapter';
import { InMemoryTokenSnapshotRepository } from 'discovery/enrichment/infrastructure/repositories/in-memory-token-snapshot.repository';
import { InProcessEnrichmentEventPublisher } from 'discovery/enrichment/infrastructure/messaging/in-process-enrichment-event.publisher';
import { CallNormalizedHandler } from 'discovery/enrichment/infrastructure/event-bus/call-normalized.handler';
import { EnrichmentController } from 'discovery/enrichment/api/http/enrichment.controller';
import { PROVIDERS } from 'discovery/enrichment/enrichment.tokens';

/**
 * Enrichment BC module.
 *
 * Consumes: `normalization.call.normalized` events
 * Emits:    `enrichment.token.enriched` or `enrichment.token.failed`
 *
 * Providers:
 * - DexScreenerAdapter (free, all EVM + Solana)
 * - GeckoTerminalAdapter (free, holders + top10 concentration)
 * - BirdeyeAdapter (premium, Solana-only, better price accuracy)
 *
 * Results are merged across providers (first non-null wins per field).
 */
@Module({
  controllers: [EnrichmentController],
  providers: [
    EnrichTokenUseCase,
    GetSnapshotUseCase,
    ListSnapshotsUseCase,
    DexScreenerAdapter,
    GeckoTerminalAdapter,
    BirdeyeAdapter,
    CallNormalizedHandler,
    {
      provide: TokenSnapshotRepository,
      useClass: InMemoryTokenSnapshotRepository,
    },
    {
      provide: EnrichmentEventPublisher,
      useClass: InProcessEnrichmentEventPublisher,
    },
    {
      provide: PROVIDERS,
      useFactory: (
        dex: DexScreenerAdapter,
        gt: GeckoTerminalAdapter,
        birdeye: BirdeyeAdapter,
      ): ReadonlyArray<MarketDataProviderPort> => [dex, gt, birdeye],
      inject: [DexScreenerAdapter, GeckoTerminalAdapter, BirdeyeAdapter],
    },
  ],
  exports: [TokenSnapshotRepository, EnrichmentEventPublisher],
})
export class EnrichmentModule {}
