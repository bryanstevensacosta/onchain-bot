import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { ApiKeyGuard } from './guards/api-key.guard';
import { DomainExceptionFilter } from './filters/domain-exception.filter';

/**
 * SharedModule - global shared kernel for market-data (Tramo 3, todo 1).
 *
 * Registers the app + database config namespaces and provides the
 * API-key guard + domain-exception filter. Framework-agnostic kernel
 * primitives (AggregateRoot, Entity, ValueObject, DomainEvent,
 * DomainError) and VOs (ChainId, TokenId) are imported directly.
 * Cache/messaging ports + metrics + HTTP client land with todo 2.
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(appConfig), ConfigModule.forFeature(databaseConfig)],
  providers: [ApiKeyGuard, DomainExceptionFilter],
  exports: [ConfigModule, ApiKeyGuard, DomainExceptionFilter],
})
export class SharedModule {}
