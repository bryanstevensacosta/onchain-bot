import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { MatchingModule } from './matching/matching.module';
import { KeywordsModule } from './keywords/keywords.module';
import { FiltersModule } from './filters/filters.module';
import { QueueModule } from './queue/queue.module';
import { DeduplicationModule } from './deduplication/deduplication.module';
import { LlmModule } from './llm/llm.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { ThreadsModule } from './threads/threads.module';
import { TelegramModule } from './telegram/telegram.module';
import { ContentTemplatesModule } from './template/content-templates.module';
import { SessionsModule } from './sessions/sessions.module';
import { DomainExceptionFilter } from './shared/filters/domain-exception.filter';
import { ApiKeyGuard } from './shared/guards/api-key.guard';

/**
 * AppModule - Root module for feed-publisher skeleton (Tramo 2, todo 1).
 *
 * Wires Config (envFilePath ['.env.dev', '.env']) + HealthModule
 * (GET /api/health -> { status: 'ok' }) + 10 stub feature modules.
 * All feature modules are EMPTY stubs: business logic lands in todos 2-8.
 * P10: NO kol logic anywhere in this app (no legacy publisher, no kol bot).
 * ConfigModule is global, so feature adapters resolve ConfigService
 * without importing SharedModule.
 *
 * Todo 14 (P50): global auth + error mapping — ApiKeyGuard rides every
 * controller (only @Public() health skips it) and DomainExceptionFilter
 * maps DomainError to HTTP status (403/429/404 survive the wire).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    HealthModule,
    IngestionModule,
    MatchingModule,
    KeywordsModule,
    FiltersModule,
    QueueModule,
    DeduplicationModule,
    LlmModule,
    SchedulingModule,
    ThreadsModule,
    TelegramModule,
    ContentTemplatesModule,
    SessionsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
