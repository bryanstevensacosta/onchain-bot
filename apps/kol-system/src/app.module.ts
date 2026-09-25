import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ExtractionModule } from './extraction/extraction.module';

/**
 * AppModule - Root module for kol-system skeleton (Tramo 1, todos 2+4+5).
 *
 * Wires Config (envFilePath ['.env.dev', '.env']) + HealthModule
 * (GET /api/health -> { status: 'ok' }) + IngestionModule (KOL SSE
 * client, P20 SSE-only with reconnect catch-up by cursor) +
 * ExtractionModule (contract x mention, P5, direct call fix-1 + P26
 * snapshot bases handed directly to enrichment).
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
  ],
})
export class AppModule {}
