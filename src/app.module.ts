import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { appConfig } from 'shared/common/config/app.config';
import { DatabaseModule } from 'shared/common/persistence/database.module';
import { TelegramIngestionModule } from 'discovery/ingestion/telegram/telegram-ingestion.module';
import { ExtractionModule } from 'discovery/extraction/extraction.module';
import { ParsingModule } from 'discovery/parsing/parsing.module';
import { NormalizationModule } from 'discovery/normalization/normalization.module';
import { ChainDetectionModule } from 'discovery/chain-detection/chain-detection.module';
import { EnrichmentModule } from 'discovery/enrichment/enrichment.module';
import { ClassificationModule } from 'discovery/classification/classification.module';
import { ScoringModule } from 'discovery/scoring/scoring.module';
import { FiltersModule } from 'discovery/filters/filters.module';
import { TelegramPublishingModule } from 'discovery/publishing/telegram/publishing.module';
import { AnalyticsModule } from 'discovery/analytics/analytics.module';
import { HoneypotModule } from 'discovery/honeypot/honeypot.module';
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
    TelegramIngestionModule,
    ExtractionModule,
    ParsingModule,
    NormalizationModule,
    ChainDetectionModule,
    EnrichmentModule,
    ClassificationModule,
    ScoringModule,
    FiltersModule,
    TelegramPublishingModule,
    AnalyticsModule,
    HoneypotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
