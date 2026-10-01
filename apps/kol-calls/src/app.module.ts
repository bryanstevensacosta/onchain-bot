import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from './shared/shared.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ExtractionModule } from './extraction/extraction.module';
import { ParsingModule } from './parsing/parsing.module';
import { NormalizationModule } from './normalization/normalization.module';
import { EnrichmentModule } from './enrichment/enrichment.module';
import { SnapshotModule } from './snapshot/snapshot.module';
import { TrackingModule } from './tracking/tracking.module';

/**
 * AppModule - Root module for kol-calls (P51 split: this app is now the
 * hot-path calls service; scoring/templates/approval/publishing moved to
 * apps/kol-calls-publisher).
 *
 * Wires Config (envFilePath ['.env.dev', '.env']) + HealthModule
 * (GET /api/health -> { status: 'ok', components }) + IngestionModule
 * (KOL SSE client, P20 SSE-only with reconnect catch-up by cursor) +
 * ExtractionModule (contract x mention, P5, direct call fix-1 + P26
 * snapshot bases handed directly to enrichment) + ParsingModule
 * (structured call per mention, P5 1:1, direct call fix-1) +
 * NormalizationModule (mention index, P1 + G-12, direct call fix-1,
 * one normalization.call.normalized event per mention via direct return,
 * plus the P51 `GET /api/mentions` contract reads) + EnrichmentModule
 * (MarketDataPort dual: local-cascade default, http-market-data stub
 * behind USE_DATA_SERVICE_API, P7, direct call fix-1, completes the P26
 * snapshot) + SnapshotModule (owns the mention_snapshots entity, P27,
 * same DB, enrichment writes via port, plus the P51
 * `GET /api/snapshots` contract reads) + TrackingModule (first-seen +
 * rating + rankings API, Ph12 + P8 + P11 + P17: TrackedMention +
 * RecordMention + TrackingCron + GET /api/kol-rankings — the rating
 * endpoint stays here and reads own tracking, P51).
 * `SharedModule` (@Global: config namespaces + ApiKeyGuard) is imported so
 * the P50 `@UseGuards(ApiKeyGuard)` on every controller resolves app-wide.
 * ConfigModule is global, so the ingestion HTTP adapter resolves
 * ConfigService without importing SharedModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    SharedModule,
    HealthModule,
    IngestionModule,
    ExtractionModule,
    ParsingModule,
    NormalizationModule,
    EnrichmentModule,
    SnapshotModule,
    TrackingModule,
  ],
})
export class AppModule {}
