import * as path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DevBackfillHook } from 'shared/common/dev-backfill.hook';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import pino from 'pino';
import { appConfig } from 'shared/common/config/app.config';
import type { AppConfig } from 'shared/common/config/app.config';
import { DatabaseModule } from 'shared/common/persistence/database.module';
import { RedisModule } from 'shared/common/cache/redis.module';
import { FilteredBootstrapLogger } from 'shared/common/filtered-bootstrap-logger';
import { ConfigConnectivityService } from 'shared/common/config/config-connectivity.service';
// import { DashboardModule } from 'dashboard/dashboard.module';
import { ExtractionModule } from 'token/intake/extraction/extraction.module';
import { ParsingModule } from 'token/intake/parsing/parsing.module';
import { NormalizationModule } from 'token/normalization/normalization.module';
import { ChainDetectionModule } from 'chain/detection/chain-detection.module';
import { ChainRegistryModule } from 'chain/registry/chain-registry.module';
import { EnrichmentModule } from 'token/enrichment/enrichment.module';
import { ClassificationModule } from 'token/classification/classification.module';
import { ScoringModule } from 'token/scoring/scoring.module';
import { VipCallApprovalModule } from 'token/vip-call-approval/vip-call-approval.module';
import { VipCallsModule as TelegramPublishingModule } from 'telegram/vip-calls/vip-channel/vip-channel.module';
import { VipDecisionsModule } from 'telegram/vip-calls/vip-decisions/decisions.module';
import { ChainDexterBotModule } from 'telegram/chain-dexter-bot/chain-dexter-bot.module';
import { CryptoNewsPublisherModule } from 'telegram/crypto-news-publisher/crypto-news-publisher.module';
import { CryptoNewsAdsModule } from 'telegram/crypto-news-ads/crypto-news-ads.module';
import { CallTrackingModule } from 'token/call-tracking/call-tracking.module';
import { AchievementModule } from 'token/achievement/achievement.module';
import { ReputationModule } from 'kol/reputation/reputation.module';
import { HoneypotModule } from 'token/honeypot/honeypot.module';
// import { IdentityModule } from 'kol/identity/identity.module';
import { TelegramIngestionModule } from 'telegram/ingestion/telegram-ingestion.module';
import { SourceModule } from 'kol/source/source.module';
import { StatsModule } from 'kol/stats/stats.module';
import { WsModule } from 'shared/ws/ws.module';
import { SettingsModule } from 'settings/settings.module';
import { DataProviderModule } from 'data-provider/core/data-provider.module';
import { HealthModule } from 'health/health.module';
import { LlmModule } from 'shared/llm';
import { DeduplicationModule } from 'shared/deduplication/deduplication.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DevModule } from './dev/dev.module';

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
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logCfg = config.get<AppConfig>('app')?.logging;
        const nodeEnv = process.env.NODE_ENV;

        // In staging, use simple stdout logging to avoid pino-roll I/O hangs
        if (nodeEnv === 'staging') {
          console.log('[AppModule] Using simple stdout logging (staging mode)');
          return {
            pinoHttp: {
              level: logCfg?.level ?? 'debug',
              // No transport — logs go directly to stdout (Docker captures them)
              autoLogging: {
                ignore: (req: { url?: string }) =>
                  req.url === '/api/health' ||
                  (req.url?.startsWith('/crypto-news/') ?? false) ||
                  (req.url?.startsWith('/crypto-news-publisher/') ?? false) ||
                  (req.url?.startsWith('/crypto-news-ads/') ?? false),
              },
              serializers: {
                req(req: { method: string; url?: string; id: unknown }) {
                  return { method: req.method, url: req.url, id: req.id };
                },
                res(res: { statusCode: number }) {
                  return { statusCode: res.statusCode };
                },
                err: pino.stdSerializers.err,
              },
            },
          };
        }

        // Production/dev: use pino-roll for file-based logging
        if (!logCfg) return {};
        const filePath = path.resolve(
          process.cwd(),
          logCfg.dir,
          logCfg.fileName,
        );
        return {
          pinoHttp: {
            level: logCfg.level,
            transport: {
              target: 'pino-roll',
              options: {
                file: filePath,
                frequency: 'daily',
                mkdir: true,
                limit: { count: 1 },
              },
            },
            autoLogging: {
              ignore: (req: { url?: string }) =>
                req.url === '/api/health' ||
                (req.url?.startsWith('/crypto-news/') ?? false) ||
                (req.url?.startsWith('/crypto-news-publisher/') ?? false) ||
                (req.url?.startsWith('/crypto-news-ads/') ?? false),
            },
            serializers: {
              req(req: { method: string; url?: string; id: unknown }) {
                return { method: req.method, url: req.url, id: req.id };
              },
              res(res: { statusCode: number }) {
                return { statusCode: res.statusCode };
              },
              err: pino.stdSerializers.err,
            },
          },
        };
      },
    }),
    RedisModule,
    HealthModule,
    DataProviderModule,
    TelegramIngestionModule,
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
    HoneypotModule,
    TelegramPublishingModule,
    VipDecisionsModule,
    ChainDexterBotModule,
    CryptoNewsPublisherModule,
    CryptoNewsAdsModule,
    CallTrackingModule,
    AchievementModule,
    ReputationModule,
    WsModule,
    SettingsModule,
    LlmModule,
    DeduplicationModule,
    DevModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    DevBackfillHook,
    FilteredBootstrapLogger,
    ConfigConnectivityService,
  ],
})
export class AppModule {}
