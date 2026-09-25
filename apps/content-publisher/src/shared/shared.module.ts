import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { redisConfig } from './config/redis.config';
import { telegramConfig } from './config/telegram.config';
import { ApiKeyGuard } from './guards/api-key.guard';
import { DomainExceptionFilter } from './filters/domain-exception.filter';
import { CachePort, InMemoryCacheAdapter } from './cache/cache.port';
import { EventBusPort, InMemoryEventBusAdapter } from './messaging/event-bus';
import { MetricsService } from './monitoring/metrics.service';
import { SharedHttpClient } from './http/http-client';

/**
 * SharedModule - global shared kernel for content-publisher (Tramo 2, todo 1).
 *
 * Registers the four config namespaces (app, database, redis, telegram)
 * and provides the API-key guard + domain-exception filter + cache port
 * (in-memory until the Redis adapter lands) + event-bus port (in-memory)
 * + metrics service + shared HTTP client (bounded retry).
 * Framework-agnostic kernel primitives (AggregateRoot, Entity,
 * ValueObject, DomainEvent, DomainError) are imported directly.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    ConfigModule.forFeature(databaseConfig),
    ConfigModule.forFeature(redisConfig),
    ConfigModule.forFeature(telegramConfig),
  ],
  providers: [
    ApiKeyGuard,
    DomainExceptionFilter,
    MetricsService,
    SharedHttpClient,
    { provide: CachePort, useClass: InMemoryCacheAdapter },
    { provide: EventBusPort, useClass: InMemoryEventBusAdapter },
  ],
  exports: [
    ConfigModule,
    ApiKeyGuard,
    DomainExceptionFilter,
    MetricsService,
    SharedHttpClient,
    CachePort,
    EventBusPort,
  ],
})
export class SharedModule {}
