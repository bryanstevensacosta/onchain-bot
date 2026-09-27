import { Test } from '@nestjs/testing';
import { ThreadsModule } from './threads.module';
import { FeedThreadsModule } from '../feed-threads/feed-threads.module';
import { FeedThread } from '../feed-threads/domain/feed-thread.entity';

describe('threads wiring', () => {
  it('boots ThreadsModule', async () => {
    const mod = await Test.createTestingModule({
      imports: [ThreadsModule],
    }).compile();
    expect(mod).toBeDefined();
    await mod.close();
  });

  it('boots FeedThreadsModule', async () => {
    const mod = await Test.createTestingModule({
      imports: [FeedThreadsModule],
    }).compile();
    expect(mod).toBeDefined();
    await mod.close();
  });

  it('walks the feed thread lifecycle', () => {
    const thread = FeedThread.create([{ content: 'm1', delayMs: 0 }]);
    expect(thread.status).toBe('DRAFT');
    thread.enqueue();
    expect(thread.status).toBe('QUEUED');
    expect(thread.toPublishState().status).toBe('IN_PROGRESS');
  });
});
