import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ExtractionModule } from './extraction/extraction.module';
import { ParsingModule } from './parsing/parsing.module';
import { NormalizationModule } from './normalization/normalization.module';
import { EnrichmentModule } from './enrichment/enrichment.module';
import { SnapshotModule } from './snapshot/snapshot.module';
import { ScoringModule } from './scoring/scoring.module';

/**
 * AppModule - Root module for kol-system skeleton (Tramo 1, todos 2+4+5).
 *
 * Wires Config (envFilePath ['.env.dev', '.env']) + HealthModule
 * (GET /api/health -> { status: 'ok' }) + IngestionModule (KOL SSE
 * client, P20 SSE-only with reconnect catch-up by cursor) +
 * ExtractionModule (contract x mention, P5, direct call fix-1 + P26
 * snapshot bases handed directly to enrichment) + ParsingModule
 * (structured call per mention, P5 1:1, direct call fix-1) +
 * NormalizationModule (mention index, P1 + G-12, direct call fix-1,
 * one normalization.call.normalized event per mention via direct return) +
 * EnrichmentModule (MarketDataPort dual: local-cascade default,
 * http-market-data stub behind USE_DATA_SERVICE_API, P7, direct call
 * fix-1, completes the P26 snapshot) + SnapshotModule (owns the
 * mention_snapshots entity, P27, same kol-system DB, enrichment writes
 * via port) + ScoringModule (score v1 + 8 gates per mention,
 * classification as per-template config, P6, direct call fix-1,
 * enrichment -> scoring -> templates).
 * ConfigModule is global, so the ingestion HTTP adapter resolves
 * ConfigService without importing SharedModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    HealthModule,
    IngestionModule,
    ExtractionModule,
    ParsingModule,
    NormalizationModule,
    EnrichmentModule,
    SnapshotModule,
    ScoringModule,
  ],
})
export class AppModule {}
