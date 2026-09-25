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
import { TemplatesModule } from './templates/templates.module';
import { ApprovalModule } from './approval/approval.module';
import { TelegramModule } from './telegram/telegram.module';
import { TrackingModule } from './tracking/tracking.module';

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
 * enrichment -> scoring -> templates) + TemplatesModule (templates CORE
 * without threads, todo 10, Ph9 + P6/P14/P16/P22/P23/P23-bis + C1:
 * orchestrator cron 1 min, 4-strategy ranking engine, 11-endpoint
 * controller, threads 501 stub, telegram_bots catalog, vip-calls seed) +
 * ApprovalModule (per-template bouncer, todo 11, Ph10: CallApproval +
 * EvaluateApproval + GetPendingApprovals + ApprovalsController) +
 * TelegramModule (per-template KOL-bot publishing, todo 11, Ph11 + C2:
 * PublishingJob + PublishFromTemplate + ManualPublish, catalog token per
 * call, first C-SHARED-01 move) + TrackingModule (first-seen + rating +
 * rankings API, todo 12, Ph12 + P8 + P11 + P17: TrackedMention +
 * RecordMention + TrackingCron + GET /api/kol-rankings).
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
    TemplatesModule,
    ApprovalModule,
    TelegramModule,
    TrackingModule,
  ],
})
export class AppModule {}
