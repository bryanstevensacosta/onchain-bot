import { Module } from '@nestjs/common';
import {
  MARKET_DATA_PROVIDERS,
  LOCAL_CASCADE_DELEGATES,
  MARKET_DATA_BASE_URL,
  MARKET_DATA_TIMEOUT_MS,
} from './enrichment.tokens';
import { MentionSnapshotRepository } from '../snapshot/application/ports/mention-snapshot.repository';
import { SnapshotModule } from '../snapshot/snapshot.module';
import { SnapshotWriterPort } from './domain/ports/snapshot-writer.port';
import { EnrichmentOrchestratorService } from './application/services/enrichment-orchestrator.service';
import { LocalCascadeMarketDataAdapter } from './infrastructure/adapters/local-cascade-market-data.adapter';
import {
  HttpMarketDataAdapter,
  HTTP_MARKET_DATA_DEFAULT_BASE_URL,
  HTTP_MARKET_DATA_DEFAULT_TIMEOUT_MS,
} from './infrastructure/adapters/http-market-data.adapter';
import { EnrichmentHealthIndicator } from './health/enrichment-health.indicator';

/**
 * Returns true only when the operator explicitly points kol-system at the
 * market-data service (Tramo 3). Default false: Tramo 1 enriches against
 * the local cascade (C-DATA-01: no providers moved, no market-data calls).
 */
export function useDataServiceApi(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.USE_DATA_SERVICE_API === 'true';
}

/**
 * EnrichmentModule — market-data bridge via dual `MarketDataPort`
 * (Tramo 1, todo 8, P7 + C-DATA-01 + G-17).
 *
 * `MARKET_DATA_PROVIDERS` resolves to `[LocalCascadeMarketDataAdapter]` by
 * default, or `[HttpMarketDataAdapter]` (stub: timeout + documented
 * p95<500ms SLO) when `USE_DATA_SERVICE_API=true`. The orchestrator merges
 * first-non-null per field (backend cascade mirror, silent-null fallback)
 * and completes the P26 snapshot, writing it through `SnapshotWriterPort`
 * (P27: `useExisting` alias of the snapshot-owned repository — enrichment
 * never touches the table directly).
 */
@Module({
  imports: [SnapshotModule],
  providers: [
    EnrichmentOrchestratorService,
    EnrichmentHealthIndicator,
    LocalCascadeMarketDataAdapter,
    HttpMarketDataAdapter,
    {
      provide: LOCAL_CASCADE_DELEGATES,
      useValue: [],
    },
    {
      provide: MARKET_DATA_BASE_URL,
      useFactory: () =>
        process.env.MARKET_DATA_URL ?? HTTP_MARKET_DATA_DEFAULT_BASE_URL,
    },
    {
      provide: MARKET_DATA_TIMEOUT_MS,
      useFactory: () =>
        parseInt(
          process.env.MARKET_DATA_TIMEOUT_MS ??
            String(HTTP_MARKET_DATA_DEFAULT_TIMEOUT_MS),
          10,
        ),
    },
    {
      provide: MARKET_DATA_PROVIDERS,
      useFactory: (
        local: LocalCascadeMarketDataAdapter,
        http: HttpMarketDataAdapter,
      ) => (useDataServiceApi() ? [http] : [local]),
      inject: [LocalCascadeMarketDataAdapter, HttpMarketDataAdapter],
    },
    {
      provide: SnapshotWriterPort,
      useExisting: MentionSnapshotRepository,
    },
  ],
  exports: [
    EnrichmentOrchestratorService,
    MARKET_DATA_PROVIDERS,
    EnrichmentHealthIndicator,
  ],
})
export class EnrichmentModule {}
