import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ThreadsModule } from './threads.module';
import { ThreadsController } from './api/http/threads.controller';
import { ThreadRepository } from './domain/ports/thread.repository';
import { ThreadMessagePublisherPort } from './domain/ports/thread-message-publisher.port';
import { ThreadBuilderService } from './application/services/thread-builder.service';
import { ThreadSchedulerService } from './application/services/thread-scheduler.service';
import { CreateThreadUseCase } from './application/use-cases/create-thread.use-case';
import { EnqueueThreadUseCase } from './application/use-cases/enqueue-thread.use-case';
import { PublishThreadUseCase } from './application/use-cases/publish-thread.use-case';
import { ThreadPublisherCronScheduler } from './application/scheduling/thread-publisher-cron.scheduler';
import { ThreadsHealthState } from './application/state/threads-health.state';
import { ThreadsHealthIndicator } from './health/threads-health.indicator';

describe('ThreadsModule', () => {
  it('wires builder + scheduler + 3 use-cases + cron + controller + health (todo 8)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ThreadsModule,
      ],
    }).compile();
    expect(module.get(ThreadsModule)).toBeDefined();
    expect(module.get(ThreadsController)).toBeDefined();
    expect(module.get(ThreadRepository)).toBeDefined();
    expect(module.get(ThreadMessagePublisherPort)).toBeDefined();
    expect(module.get(ThreadBuilderService)).toBeDefined();
    expect(module.get(ThreadSchedulerService)).toBeDefined();
    expect(module.get(CreateThreadUseCase)).toBeDefined();
    expect(module.get(EnqueueThreadUseCase)).toBeDefined();
    expect(module.get(PublishThreadUseCase)).toBeDefined();
    expect(module.get(ThreadPublisherCronScheduler)).toBeDefined();
    expect(module.get(ThreadsHealthState)).toBeDefined();
    expect(module.get(ThreadsHealthIndicator)).toBeDefined();
    await module.close();
  });
});
