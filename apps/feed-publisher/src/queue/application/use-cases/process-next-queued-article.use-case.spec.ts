import { ConfigService } from '@nestjs/config';
import { ProcessNextQueuedArticleUseCase } from './process-next-queued-article.use-case';
import { QueueManager } from '../services/queue-manager.service';
import { QueueHealthState } from '../state/queue-health.state';
import { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';
import { InMemoryPublisherQueueRepository } from '../../infrastructure/persistence/in-memory/in-memory-publisher-queue.repository';
import type { QueuedArticleRendererPort } from '../ports/queued-article-renderer.port';
import type { QueuedArticleDispatcherPort } from '../ports/queued-article-dispatcher.port';

function build(
  opts: {
    render?: (entry: PublisherQueueEntry) => Promise<{ content: string }>;
    dispatch?: (
      entry: PublisherQueueEntry,
      content: string,
    ) => Promise<{ telegramMessageId: string }>;
    maxAttempts?: number;
  } = {},
) {
  const repo = new InMemoryPublisherQueueRepository();
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'QUEUE_MAX_PENDING') {
        return '36';
      }
      if (key === 'LLM_MAX_ATTEMPTS') {
        return String(opts.maxAttempts ?? 3);
      }
      return fallback;
    }),
  } as unknown as ConfigService;
  const manager = new QueueManager(repo, config);
  const health = new QueueHealthState();
  const renderer: QueuedArticleRendererPort = {
    render: jest.fn(
      opts.render ?? (async (entry) => ({ content: entry.rawContent })),
    ),
  };
  const dispatcher: QueuedArticleDispatcherPort = {
    dispatch: jest.fn(
      opts.dispatch ?? (async () => ({ telegramMessageId: 'tg-1' })),
    ),
  };
  const useCase = new ProcessNextQueuedArticleUseCase(
    manager,
    renderer,
    dispatcher,
    health,
    config,
  );
  return { useCase, manager, repo, health, renderer, dispatcher };
}

async function seed(manager: QueueManager, messageId = 1) {
  const entry = PublisherQueueEntry.create({
    contentType: 'crypto-news',
    channelId: '-1001',
    messageId,
    rawContent: 'raw body',
  });
  await manager.enqueue(entry);
  return entry;
}

describe('ProcessNextQueuedArticleUseCase', () => {
  it('drains one PENDING entry to PUBLISHED and records health', async () => {
    const { useCase, repo, health } = build();
    const seeded = await seed(useCaseManagers(useCase).manager);
    void seeded;
    const result = await useCase.execute();
    expect(result.processed).toBe(true);
    expect(result.status).toBe('PUBLISHED');
    const counts = await useCaseManagers(useCase).manager.counts();
    expect(counts.published).toBe(1);
    expect(health.lastProcessedAt).not.toBeNull();
    expect(health.consecutiveFailures).toBe(0);
    void repo;
  });

  it('returns unprocessed when the queue is empty', async () => {
    const { useCase } = build();
    const result = await useCase.execute();
    expect(result).toEqual({ processed: false });
  });

  it('retries render failures until max attempts, then marks FAILED', async () => {
    const { useCase } = build({
      render: jest.fn().mockRejectedValue(new Error('renderer down')),
      maxAttempts: 2,
    });
    const manager = useCaseManagers(useCase).manager;
    await seed(manager);
    const first = await useCase.execute();
    expect(first.processed).toBe(true);
    expect(first.status).toBe('PENDING');
    const second = await useCase.execute();
    expect(second.status).toBe('FAILED');
  });

  it('releases to PENDING without counting an attempt when the bot is not configured', async () => {
    const { useCase } = build({
      dispatch: jest
        .fn()
        .mockRejectedValue(new Error('CRYPTO_NEWS_BOT_TOKEN not configured')),
    });
    const manager = useCaseManagers(useCase).manager;
    await seed(manager);
    const result = await useCase.execute();
    expect(result.status).toBe('PENDING');
    const next = await manager.nextPending();
    expect(next?.attempts).toBe(0);
  });

  it('marks FAILED after max dispatch attempts', async () => {
    const { useCase } = build({
      dispatch: jest.fn().mockRejectedValue(new Error('Telegram 500')),
      maxAttempts: 1,
    });
    const manager = useCaseManagers(useCase).manager;
    await seed(manager);
    const result = await useCase.execute();
    expect(result.status).toBe('FAILED');
  });
});

function useCaseManagers(useCase: ProcessNextQueuedArticleUseCase): {
  manager: QueueManager;
} {
  return useCase as unknown as { manager: QueueManager };
}
