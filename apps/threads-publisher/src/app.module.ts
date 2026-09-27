import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { ThreadsModule } from './threads/threads.module';
import { FeedThreadsModule } from './feed-threads/feed-threads.module';
import { TelegramModule } from './telegram/telegram.module';
import { DomainExceptionFilter } from './shared/filters/domain-exception.filter';
import { ApiKeyGuard } from './shared/guards/api-key.guard';

/**
 * AppModule (todo 9): Config + Health + Threads (Meta publisher) +
 * FeedThreads (feed-publisher thread skeleton, v2 owner) + Telegram
 * (gateway dual-run). Global x-api-key guard (401) + DomainError filter.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    HealthModule,
    ThreadsModule,
    FeedThreadsModule,
    TelegramModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
