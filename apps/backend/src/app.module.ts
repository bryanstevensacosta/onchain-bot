import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { appConfig } from 'shared/common/config/app.config';
import { DatabaseModule } from 'shared/common/persistence/database.module';
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
import { TelegramPublishingModule } from 'telegram-publishing/publishing.module';
import { CallTrackingModule } from 'token/call-tracking/call-tracking.module';
import { ReputationModule } from 'telegram-kol/reputation/reputation.module';
import { HoneypotModule } from 'token/honeypot/honeypot.module';
import { IdentityModule } from 'telegram-kol/identity/identity.module';
import { SourceModule } from 'telegram-kol/source/source.module';
import { StatsModule } from 'telegram-kol/stats/stats.module';
import { WsModule } from 'shared/ws/ws.module';
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
    CallTrackingModule,
    ReputationModule,
    HoneypotModule,
    DashboardModule,
    WsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
