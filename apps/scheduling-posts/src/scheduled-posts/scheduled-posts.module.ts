import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SchedulingModule } from 'scheduling/scheduling.module';
import { TelegramModule } from 'telegram/telegram.module';
import { ScheduledPostRepository } from './domain/ports/scheduled-post.repository';
import { SessionBindingAuthorizer } from './domain/ports/session-binding.authorizer';
import { ContentRefResolver } from './domain/ports/content-ref.resolver';
import { PublishRateLimiter } from './domain/ports/publish-rate-limiter.port';
import { ScheduleResultCallbackPort } from './domain/ports/schedule-result-callback.port';
import { InMemoryScheduledPostRepository } from './infrastructure/persistence/in-memory/in-memory-scheduled-post.repository';
import { InMemorySessionAuthorizer } from './infrastructure/sessions/in-memory-session.authorizer';
import { parseSessionBindings } from './infrastructure/sessions/session-bindings.loader';
import { InMemoryContentRefResolver } from './infrastructure/content/in-memory-content-ref.resolver';
import { InMemoryPublishRateLimiter } from './infrastructure/rate-limit/in-memory-publish-rate-limiter';
import { HttpScheduleResultCallback } from './infrastructure/callbacks/http-schedule-result-callback.adapter';
import { SchedulePostUseCase } from './application/use-cases/schedule-post.use-case';
import { CancelScheduledPostUseCase } from './application/use-cases/cancel-scheduled-post.use-case';
import { FireDuePostsUseCase } from './application/use-cases/fire-due-posts.use-case';
import { ScheduledPostsCronScheduler } from './application/scheduling/scheduled-posts-cron.scheduler';
import { ScheduledPostsController } from './api/http/scheduled-posts.controller';
import { ScheduledPostsHealthIndicator } from './health/scheduled-posts-health.indicator';

/**
 * ScheduledPostsModule (contract §§2-6: session → scheduler posts).
 *
 * Schedule (201 / idempotent 200) → per-target delay/cap fire (1min
 * cron, HOLD never drop) → gateway-only dispatch → terminal
 * callbacks. In-memory adapters are LIVE (TypeORM `scheduled_posts`
 * shape ships unwired, GAP-1). Session bindings seed from
 * `SCHEDULING_SESSION_BINDINGS` JSON at boot (HTTP session lookup is
 * the cutover follow-up).
 */
@Module({
  imports: [ConfigModule, SchedulingModule, TelegramModule],
  controllers: [ScheduledPostsController],
  providers: [
    SchedulePostUseCase,
    CancelScheduledPostUseCase,
    FireDuePostsUseCase,
    ScheduledPostsCronScheduler,
    ScheduledPostsHealthIndicator,
    InMemoryScheduledPostRepository,
    InMemorySessionAuthorizer,
    InMemoryContentRefResolver,
    InMemoryPublishRateLimiter,
    HttpScheduleResultCallback,
    {
      provide: ScheduledPostRepository,
      useExisting: InMemoryScheduledPostRepository,
    },
    {
      provide: SessionBindingAuthorizer,
      useExisting: InMemorySessionAuthorizer,
    },
    {
      provide: ContentRefResolver,
      useExisting: InMemoryContentRefResolver,
    },
    {
      provide: PublishRateLimiter,
      useExisting: InMemoryPublishRateLimiter,
    },
    {
      provide: ScheduleResultCallbackPort,
      useExisting: HttpScheduleResultCallback,
    },
  ],
  exports: [
    ScheduledPostRepository,
    SessionBindingAuthorizer,
    SchedulePostUseCase,
    FireDuePostsUseCase,
    ScheduledPostsHealthIndicator,
  ],
})
export class ScheduledPostsModule implements OnModuleInit {
  public constructor(
    private readonly sessions: InMemorySessionAuthorizer,
    private readonly config: ConfigService,
  ) {}

  public async onModuleInit(): Promise<void> {
    const raw = this.config.get<string>('SCHEDULING_SESSION_BINDINGS', '') ?? '';
    for (const session of parseSessionBindings(raw)) {
      await this.sessions.seed(session);
    }
  }
}
