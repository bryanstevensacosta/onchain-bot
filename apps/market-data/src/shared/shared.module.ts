import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './infrastructure/config/app.config';
import { databaseConfig } from './infrastructure/config/database.config';
import { ApiKeyGuard } from './infrastructure/guards/api-key.guard';
import { DomainExceptionFilter } from './infrastructure/filters/domain-exception.filter';
import { AuthModule } from 'auth/auth.module';

/**
 * SharedModule - global shared kernel for market-data (Tramo 3, todo 1;
 * hexagonal layout todo 12, P50: domain/ owns the framework-agnostic
 * kernel + value objects + pure key helpers, infrastructure/ owns
 * config namespaces + guards + filters + decorators, application/
 * stays empty until a transversal use case lands).
 *
 * Registers the app + database config namespaces and provides the
 * API-key guard + domain-exception filter. Framework-agnostic kernel
 * primitives (AggregateRoot, Entity, ValueObject, DomainEvent,
 * DomainError) and VOs (ChainId, TokenId) are imported directly.
 * Cache/messaging ports + metrics + HTTP client land with todo 2.
 */
@Global()
@Module({
  imports: [ConfigModule.forFeature(appConfig), ConfigModule.forFeature(databaseConfig), AuthModule],
  providers: [ApiKeyGuard, DomainExceptionFilter],
  exports: [ConfigModule, ApiKeyGuard, DomainExceptionFilter],
})
export class SharedModule {}
