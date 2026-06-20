import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { appConfig } from 'shared/common/config/app.config';
import { DatabaseModule } from 'shared/common/persistence/database.module';
import { TelegramIngestionModule } from 'ca/ingestion/telegram/telegram-ingestion.module';
import { ExtractionModule } from 'ca/extraction/extraction.module';
import { ParsingModule } from 'ca/parsing/parsing.module';
import { NormalizationModule } from 'ca/normalization/normalization.module';
import { ChainDetectionModule } from 'ca/chain-detection/chain-detection.module';
import { EnrichmentModule } from 'ca/enrichment/enrichment.module';
import { ClassificationModule } from 'ca/classification/classification.module';
import { ScoringModule } from 'ca/scoring/scoring.module';
import { FiltersModule } from 'ca/filters/filters.module';
import { TelegramPublishingModule } from 'ca/publishing/telegram/publishing.module';
import { AnalyticsModule } from 'ca/analytics/analytics.module';
import { HoneypotModule } from 'ca/honeypot/honeypot.module';
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
