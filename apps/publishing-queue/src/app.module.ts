import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { ScheduledPostsModule } from './scheduled-posts/scheduled-posts.module';
import { TelegramModule } from './telegram/telegram.module';
import { DomainExceptionFilter } from './shared/filters/domain-exception.filter';
import { ApiKeyGuard } from './shared/guards/api-key.guard';

/**
 * AppModule (todos 1-2): Config (envFilePath ['.env.dev', '.env']) +
 * Health (GET /api/health, the ONLY keyless route) + Scheduling
 * (moved rotation catalog + media library) + ScheduledPosts
 * (contract §§2-6 posts) + Telegram (gateway-only transport, P42).
 * Global x-api-key guard (401 on mismatch) + DomainError filter
 * (403/409/422 survive the wire).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),
    HealthModule,
    SchedulingModule,
    ScheduledPostsModule,
    TelegramModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
