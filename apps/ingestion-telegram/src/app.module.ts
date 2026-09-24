import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { appConfig } from './shared/common/config/app.config';
import { ApiKeyGuard } from './shared/common/auth/api-key.guard';
import { SharedModule } from './core/shared.module';
import { StreamModule } from './stream/stream.module';
import { MediaModule } from './media/media.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { CoreModule } from './core/core.module';
import { TelegramFeedSourceEntity } from './registry/infrastructure/persistence/typeorm/entities/telegram-feed-source.entity';
import { TelegramFeedMessageEntity } from './feed/infrastructure/persistence/typeorm/entities/telegram-feed-message.entity';
import { TelegramFeedMessageMediaEntity } from './feed/infrastructure/persistence/typeorm/entities/telegram-feed-message-media.entity';

/**
 * AppModule - Root module for Ingestion Service
 *
 * Wires together:
 * - Configuration management (env vars)
 * - Event emitter (internal events)
 * - Scheduler (heartbeat, cleanup tasks)
 * - Logging (Pino structured logs)
 * - StreamModule (SSE streaming infrastructure)
 * - MediaModule (media file serving)
 * - HealthModule (health checks + metrics)
 * - TelegramModule (MTProto layer + coordinators)
 *
 * Per Requirement 6.2: Environment variable configuration
 * Per Requirement 2.1: SSE streaming via StreamModule
 * Per Requirement 4.1: Media serving via MediaModule
 * Per Requirement 5.1: Health checks via HealthModule
 * Per design.md § 2.1: MTProto layer via TelegramModule
 */
@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
      load: [appConfig],
    }),

    // Event Emitter
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
    }),

    // Scheduler
    ScheduleModule.forRoot(),

    // Database (TypeORM)
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbConfig = config.get('app.database');
        // Schema management mirrors backend database.module.ts:
        // staging/production use migration-based schema (baseline governs),
        // dev/test keep synchronize (dev stays on auto-sync; baseline is NOT
        // applied over the populated dev DB). Deploys run explicit
        // migrations (scripts/run-migrations.sh) — never migrationsRun:true.
        const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
        const useMigrations = nodeEnv === 'staging' || nodeEnv === 'production';
        const synchronize = useMigrations
          ? false
          : (dbConfig?.synchronize ?? true);
        return {
          type: 'postgres',
          host: dbConfig?.host || 'localhost',
          port: dbConfig?.port || 5432,
          username: dbConfig?.username || 'postgres',
          password: dbConfig?.password || 'postgres',
          database: dbConfig?.database || 'onchain_bot',
          entities: [
            TelegramFeedSourceEntity,
            TelegramFeedMessageEntity,
            TelegramFeedMessageMediaEntity,
          ],
          synchronize,
          logging: dbConfig?.logging || false,
          migrationsRun: false,
        };
      },
    }),

    // Logging
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
      },
    }),

    // HTTP API
    SharedModule, // Redis, LastSeenManager, TelegramClientManager
    StreamModule, // SSE streaming
    MediaModule, // Media file serving
    HealthModule, // Health checks
    MetricsModule, // Prometheus metrics

    // Telegram ingestion (MTProto + coordinator)
    CoreModule,
  ],
  providers: [
    // Partial API-key auth (gap 19): global guard, allow-all when
    // INGESTION_API_KEY is unset (dev/e2e), 401 on protected routes when set.
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
