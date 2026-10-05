import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduledPostsModule } from './scheduled-posts.module';
import { ScheduledPostsController } from './api/http/scheduled-posts.controller';
import { ScheduledPostRepository } from './domain/ports/scheduled-post.repository';
import { SessionBindingAuthorizer } from './domain/ports/session-binding.authorizer';
import { ContentRefResolver } from './domain/ports/content-ref.resolver';
import { PublishRateLimiter } from './domain/ports/publish-rate-limiter.port';
import { ScheduleResultCallbackPort } from './domain/ports/schedule-result-callback.port';
import { SchedulePostUseCase } from './application/use-cases/schedule-post.use-case';
import { CancelScheduledPostUseCase } from './application/use-cases/cancel-scheduled-post.use-case';
import { FireDuePostsUseCase } from './application/use-cases/fire-due-posts.use-case';
import { ScheduledPostsCronScheduler } from './application/scheduling/scheduled-posts-cron.scheduler';
import { ScheduledPostsHealthIndicator } from './health/scheduled-posts-health.indicator';

describe('ScheduledPostsModule', () => {
  it('wires schedule + fire + cancel + cron + controller + health (todos 1-2)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ScheduleModule.forRoot(),
        ScheduledPostsModule,
      ],
    }).compile();
    expect(module.get(ScheduledPostsModule)).toBeDefined();
    expect(module.get(ScheduledPostsController)).toBeDefined();
    expect(module.get(ScheduledPostRepository)).toBeDefined();
    expect(module.get(SessionBindingAuthorizer)).toBeDefined();
    expect(module.get(ContentRefResolver)).toBeDefined();
    expect(module.get(PublishRateLimiter)).toBeDefined();
    expect(module.get(ScheduleResultCallbackPort)).toBeDefined();
    expect(module.get(SchedulePostUseCase)).toBeDefined();
    expect(module.get(CancelScheduledPostUseCase)).toBeDefined();
    expect(module.get(FireDuePostsUseCase)).toBeDefined();
    expect(module.get(ScheduledPostsCronScheduler)).toBeDefined();
    expect(module.get(ScheduledPostsHealthIndicator)).toBeDefined();
    const health = await module.get(ScheduledPostsHealthIndicator).check();
    expect(health).toEqual({ component: 'scheduled-posts', status: 'up' });
    await module.close();
  });
});
