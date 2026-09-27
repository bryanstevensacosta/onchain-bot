import { ThreadsPublisherCronScheduler } from './threads-publisher-cron.scheduler';
import { ThreadsTokenRefresher } from './threads-token-refresher';
import { ProcessNextThreadsArticleUseCase } from './process-next-threads-article.use-case';
import { EnqueueThreadsMessageUseCase } from './enqueue-threads-message.use-case';
import { ThreadsKeyword } from '../domain/threads-keyword.entity';
import { InMemoryThreadsQueueRepository } from '../infrastructure/in-memory-threads-queue.repository';
import { ThreadsApiPublisherAdapter } from '../infrastructure/threads-api-publisher.adapter';
import { ThreadsLlmConfig } from '../domain/threads-llm-config.entity';

describe('threads schedulers', () => {
  it('pins the advisory lock id (never 7421371/8013203/9421373)', () => {
    expect(
      ThreadsPublisherCronScheduler.THREADS_PUBLISHER_ADVISORY_LOCK_ID,
    ).toBe(7_421_372);
    for (const forbidden of [7421371, 8013203, 9421373]) {
      expect(
        ThreadsPublisherCronScheduler.THREADS_PUBLISHER_ADVISORY_LOCK_ID,
      ).not.toBe(forbidden);
    }
    expect(ThreadsPublisherCronScheduler.CRON_EXPRESSION).toBe('*/10 * * * *');
  });

  it('drains one entry to PUBLISHED with a mocked publisher', async () => {
    const repo = new InMemoryThreadsQueueRepository();
    const publisher = {
      publish: jest.fn().mockResolvedValue({
        ok: true,
        status: 'published',
        remoteId: 'm1',
        text: 'hi',
        truncated: false,
      }),
    };
    const drain = new ProcessNextThreadsArticleUseCase(repo, publisher as never);
    const enqueue = new EnqueueThreadsMessageUseCase(repo);
    await enqueue.execute({
      channelId: '-1001',
      messageId: 7,
      content: 'hello threads',
      matchedKeywords: [new ThreadsKeyword({ id: 'k1', phrase: 'hello' })],
    });
    const enabled = new ThreadsLlmConfig({
      llmEnabled: false,
      publishingEnabled: true,
      rejectNonLatin: false,
      dailyCap: 60,
      llmMaxAttempts: 3,
      model: 'test-model',
    });
    const res = await drain.execute(enabled);
    expect(res.processed).toBe(true);
  });

  it('skips the drain when publishing is disabled', async () => {
    const repo = new InMemoryThreadsQueueRepository();
    const adapter = new ThreadsApiPublisherAdapter({} as never);
    const drain = new ProcessNextThreadsArticleUseCase(repo, adapter);
    const res = await drain.execute(ThreadsLlmConfig.default());
    expect(res.processed).toBe(false);
  });

  it('token refresher warns without network when no token', async () => {
    const prev = process.env.THREADS_ACCESS_TOKEN;
    delete process.env.THREADS_ACCESS_TOKEN;
    const refresher = new ThreadsTokenRefresher();
    const res = await refresher.tick();
    expect(res.refreshed).toBe(false);
    if (prev !== undefined) {
      process.env.THREADS_ACCESS_TOKEN = prev;
    }
  });
});
