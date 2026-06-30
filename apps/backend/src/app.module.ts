import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DevBackfillHook } from 'shared/common/dev-backfill.hook';
import { ScheduleModule } from '@nestjs/schedule';
import { appConfig } from 'shared/common/config/app.config';
import { DatabaseModule } from 'shared/common/persistence/database.module';
import { RedisModule } from 'shared/common/cache/redis.module';
import { DashboardModule } from 'dashboard/dashboard.module';
import { ExtractionModule } from 'token/intake/extraction/extraction.module';
import { ParsingModule } from 'token/intake/parsing/parsing.module';
import { NormalizationModule } from 'token/normalization/normalization.module';
import { ChainDetectionModule } from 'chain/detection/chain-detection.module';
import { ChainRegistryModule } from 'chain/registry/chain-registry.module';
import { EnrichmentModule } from 'token/enrichment/enrichment.module';
import { ClassificationModule } from 'token/classification/classification.module';
import { ScoringModule } from 'token/scoring/scoring.module';
import { VipCallApprovalModule } from 'token/vip-call-approval/vip-call-approval.module';
import { VipCallsModule as TelegramPublishingModule } from 'telegram/vip-calls-channel/vip-calls.module';
import { ChainDexterBotModule } from 'telegram/chain-dexter-bot/chain-dexter-bot.module';
import { CallTrackingModule } from 'token/call-tracking/call-tracking.module';
import { AchievementModule } from 'token/achievement/achievement.module';
import { ReputationModule } from 'kol/reputation/reputation.module';
import { HoneypotModule } from 'token/honeypot/honeypot.module';
import { IdentityModule } from 'kol/identity/identity.module';
import { TelegramIngestionModule } from 'telegram/ingestion/telegram-ingestion.module';
import { SourceModule } from 'kol/source/source.module';
import { StatsModule } from 'kol/stats/stats.module';
import { WsModule } from 'shared/ws/ws.module';
import { SettingsModule } from 'settings/settings.module';
import { DataProviderModule } from 'data-provider/core/data-provider.module';
import { HealthModule } from 'health/health.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
      load: [appConfig],
    }),
    EventEmitterModule.forRoot({
      global: true,
      wildcard: false,
      delimiter: '.',
      maxListeners: 32,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule.forRootFromEnv(),
    RedisModule,
    HealthModule,
    TelegramIngestionModule,
    IdentityModule,
    SourceModule,
    StatsModule,
    ExtractionModule,
    ParsingModule,
    NormalizationModule,
    ChainDetectionModule,
    ChainRegistryModule,
    EnrichmentModule,
    ClassificationModule,
    ScoringModule,
    VipCallApprovalModule,
    TelegramPublishingModule,
    ChainDexterBotModule,
    CallTrackingModule,
    AchievementModule,
    ReputationModule,
    HoneypotModule,
    DashboardModule,
    WsModule,
    SettingsModule,
    DataProviderModule,
  ],
  controllers: [AppController],
  providers: [AppService, DevBackfillHook],
})
export class AppModule {}
