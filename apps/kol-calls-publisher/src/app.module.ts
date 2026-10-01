import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from './shared/shared.module';
import { HealthModule } from './health/health.module';
import { ScoringModule } from './scoring/scoring.module';
import { TemplatesModule } from './templates/templates.module';
import { ApprovalModule } from './approval/approval.module';
import { TelegramModule } from './telegram/telegram.module';
import { TargetModule } from './target/target.module';
import { KolCallsModule } from './kol-calls/kol-calls.module';

/**
 * AppModule - Root module for kol-calls-publisher (P51 split from kol-system).
 *
 * Wires Config (envFilePath ['.env.dev', '.env']) + HealthModule
 * (GET /api/health -> { status: 'ok', components }) + ScoringModule
 * (score v1 + 8 gates per mention, unchanged math — inputs now arrive
 * via the KolCallsSyncService join of the P51 mentions+snapshots HTTP
 * contract) + TemplatesModule (templates CORE without threads, Ph9 +
 * P6/P14/P16/P22/P23/P23-bis + C1) + ApprovalModule (per-template
 * bouncer, Ph10) + TelegramModule (per-template KOL-bot publishing,
 * Ph11 + C2, gateway routing) + KolCallsModule (upstream kol-calls HTTP
 * client + sync cron + health indicator).
 * `SharedModule` (@Global: config namespaces + ApiKeyGuard) is imported so
 * the P50 `@UseGuards(ApiKeyGuard)` on every controller resolves app-wide.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    SharedModule,
    HealthModule,
    ScoringModule,
    TemplatesModule,
    ApprovalModule,
    TelegramModule,
    TargetModule,
    KolCallsModule,
  ],
})
export class AppModule {}
