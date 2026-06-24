import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { ChainExplorerModule } from 'chain/explorer/chain-explorer.module';
import { ClassificationModule } from 'token/classification/classification.module';
import { ScoringModule } from 'token/scoring/scoring.module';
import { FiltersModule } from 'token/token-gating/filters.module';
import { VipCallsModule as TelegramPublishingModule } from 'telegram/vip-calls-channel/vip-calls.module';
import { ChainDexterBotModule } from 'telegram/chain-dexter-bot/chain-dexter-bot.module';
import { CallTrackingModule } from 'token/call-tracking/call-tracking.module';
import { MilestoneModule } from 'token/milestone/milestone.module';
import { ReputationModule } from 'kol/reputation/reputation.module';
import { HoneypotModule } from 'token/honeypot/honeypot.module';
import { IdentityModule } from 'kol/identity/identity.module';
import { SourceModule } from 'kol/source/source.module';
import { StatsModule } from 'kol/stats/stats.module';
import { WsModule } from 'shared/ws/ws.module';
import { SettingsModule } from 'settings/settings.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
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
    IdentityModule,
    SourceModule,
    StatsModule,
    ExtractionModule,
    ParsingModule,
    NormalizationModule,
    ChainDetectionModule,
    ChainRegistryModule,
    ChainExplorerModule,
    ClassificationModule,
    ScoringModule,
    FiltersModule,
    TelegramPublishingModule,
    ChainDexterBotModule,
    CallTrackingModule,
    MilestoneModule,
    ReputationModule,
    HoneypotModule,
    DashboardModule,
    WsModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
