import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { redisConfig } from './config/redis.config';
import { telegramConfig } from './config/telegram.config';
import { ApiKeyGuard } from './guards/api-key.guard';
import { DomainExceptionFilter } from './filters/domain-exception.filter';

/**
 * SharedModule - global shared kernel for kol-calls-publisher (P51 split).
 *
 * Registers the four config namespaces (app, database, redis, telegram)
 * and provides the API-key guard + domain-exception filter.
 * Copied from kol-system at the P51 split (same kernel, publisher key
 * names); framework-agnostic kernel primitives (AggregateRoot, Entity,
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
  providers: [ApiKeyGuard, DomainExceptionFilter],
  exports: [ConfigModule, ApiKeyGuard, DomainExceptionFilter],
})
export class SharedModule {}
