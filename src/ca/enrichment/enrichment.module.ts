import { Module } from '@nestjs/common';
import { MarketDataProviderPort } from 'ca/enrichment/domain/ports/market-data-provider.port';
import { TokenSnapshotRepository } from 'ca/enrichment/application/ports/token-snapshot.repository';
import { EnrichmentEventPublisher } from 'ca/enrichment/application/ports/enrichment-event.publisher';
import { EnrichTokenUseCase } from 'ca/enrichment/application/handlers/enrich-token.use-case';
import { GetSnapshotUseCase } from 'ca/enrichment/application/handlers/get-snapshot.use-case';
import { ListSnapshotsUseCase } from 'ca/enrichment/application/handlers/list-snapshots.use-case';
import { DexScreenerAdapter } from 'ca/enrichment/infrastructure/providers/dexscreener.adapter';
import { GeckoTerminalAdapter } from 'ca/enrichment/infrastructure/providers/geckoterminal.adapter';
import { BirdeyeAdapter } from 'ca/enrichment/infrastructure/providers/birdeye.adapter';
import { InMemoryTokenSnapshotRepository } from 'ca/enrichment/infrastructure/repositories/in-memory-token-snapshot.repository';
import { InProcessEnrichmentEventPublisher } from 'ca/enrichment/infrastructure/messaging/in-process-enrichment-event.publisher';
import { CallNormalizedHandler } from 'ca/enrichment/infrastructure/event-bus/call-normalized.handler';
import { EnrichmentController } from 'ca/enrichment/api/http/enrichment.controller';
import { PROVIDERS } from 'ca/enrichment/enrichment.tokens';

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
