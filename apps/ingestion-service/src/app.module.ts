import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { appConfig } from './shared/common/config/app.config';
import { StreamModule } from './stream/stream.module';
import { MediaModule } from './media/media.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

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
 * - Bounded contexts (to be added in subsequent tasks)
 * 
 * Per Requirement 6.2: Environment variable configuration
 * Per Requirement 2.1: SSE streaming via StreamModule
 * Per Requirement 4.1: Media serving via MediaModule
 * Per Requirement 5.1: Health checks via HealthModule
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
    StreamModule,  // SSE streaming
    MediaModule,   // Media file serving
    HealthModule,  // Health checks
    MetricsModule, // Prometheus metrics

    // TODO: Add bounded context modules in subsequent tasks:
    // - TelegramModule (MTProto layer + coordinators)
  ],
})
export class AppModule {}
