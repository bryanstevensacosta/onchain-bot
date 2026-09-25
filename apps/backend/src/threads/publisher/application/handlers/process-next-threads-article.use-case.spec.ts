import { LlmPort } from 'shared/llm';
import { isBlockingFailureReason } from 'shared/deduplication/domain/constants/blocking-failure-reasons';
import { SharedThrottleStateRepository } from 'telegram/shared/application/ports/shared-throttle-state.repository';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { InMemoryThreadsQueueRepository } from 'threads/publisher/application/repositories/in-memory-threads-queue.repository';
import { InMemoryThreadsLlmConfigRepository } from 'threads/publisher/application/repositories/in-memory-threads-llm-config.repository';
import {
  ThreadsApiPublisherPort,
  type ThreadsPublishResult,
} from 'threads/publisher/application/ports/threads-api-publisher.port';
import {
  EnqueueThreadsMessageUseCase,
  type EnqueueThreadsMessageDto,
} from './enqueue-threads-message.use-case';
import { ProcessNextThreadsArticleUseCase } from './process-next-threads-article.use-case';

class FakeThrottleStateRepo extends SharedThrottleStateRepository {
  private last: Date | null = null;
  public async load(): Promise<never> {
    throw new Error('not used');
  }
  public async save(): Promise<void> {
    return undefined;
  }
  public async getLastPublishAt(): Promise<Date | null> {
    return this.last;
  }
  public async setLastPublishAt(at: Date): Promise<void> {
    this.last = at;
  }
}

class FakeLlm extends LlmPort {
  public calls = 0;
  public constructor(private readonly output: string) {
    super();
  }
  public async generateText(): Promise<string> {
    this.calls += 1;
    return this.output;
  }
  public async isAvailable(): Promise<boolean> {
    return true;
  }
}

class FakePublisher extends ThreadsApiPublisherPort {
  public publishedTexts: string[] = [];
  public constructor(private readonly behavior: () => ThreadsPublishResult) {
    super();
  }
  public async publish(input: { text: string }): Promise<ThreadsPublishResult> {
    this.publishedTexts.push(input.text);
    return this.behavior();
  }
}

const successResult = (remoteId: string): ThreadsPublishResult => ({
  ok: true,
  status: 'published',
  remoteId,
  text: 'sent',
  truncated: false,
});

const failureResult = (
  reason: string,
  reintentable: boolean,
): ThreadsPublishResult => ({
  ok: false,
  status: 'FAILED',
  reason,
  reintentable,
});

const message = (messageId: number): EnqueueThreadsMessageDto => ({
  channelId: '-100123',
  messageId,
  content: 'bitcoin ETF inflows hit record',
  publishedAt: new Date('2026-09-01T12:00:00Z'),
  ingestedAt: new Date('2026-09-01T12:01:00Z'),
  media: [],
  groupedId: null,
  matchedKeywords: [],
});

const setup = (opts?: {
  llmOutput?: string;
  publishBehavior?: () => ThreadsPublishResult;
  config?: {
    llmEnabled?: boolean;
    publishingEnabled?: boolean;
    dailyCap?: number;
    llmMaxAttempts?: number;
  };
}) => {
  const queueRepo = new InMemoryThreadsQueueRepository();
  const configRepo = new InMemoryThreadsLlmConfigRepository();
  configRepo.seed({
    publishingEnabled: true,
    ...(opts?.config ?? {}),
  });
  const throttle = new SharedThrottleSchedulerService(
    new FakeThrottleStateRepo(),
    {
      minDelayMs: 0,
      maxDelayMs: 0,
    },
  );
  const llm = new FakeLlm(opts?.llmOutput ?? 'refined post');
  const publisher = new FakePublisher(
    opts?.publishBehavior ?? (() => successResult('post-1')),
  );
  const enqueue = new EnqueueThreadsMessageUseCase(queueRepo);
  const useCase = new ProcessNextThreadsArticleUseCase(
    queueRepo,
    throttle,
    llm,
    publisher,
    configRepo,
  );
  return { queueRepo, configRepo, throttle, llm, publisher, enqueue, useCase };
};

describe('ProcessNextThreadsArticleUseCase', () => {
  it('drains happy path: PENDING → PUBLISHED via the fake port (raw mode)', async () => {
    const { queueRepo, enqueue, useCase, publisher, llm } = setup();

    const entry = await enqueue.execute({ message: message(1) });
    await useCase.execute();

    const after = await queueRepo.findById(entry!.id);
    expect(after!.status).toBe('PUBLISHED');
    expect(after!.telegramMessageId).toBe('post-1');
    expect(publisher.publishedTexts).toEqual([
      'bitcoin ETF inflows hit record',
    ]);
    // Raw mode: LLM untouched.
    expect(llm.calls).toBe(0);
    // Daily cap decremented: one PUBLISHED row counts.
    expect(await queueRepo.countPublishedToday(4)).toBe(1);
  });

  it('uses LLM content when llmEnabled AND publishingEnabled are both true', async () => {
    const { enqueue, useCase, publisher, llm } = setup({
      config: { llmEnabled: true },
    });

    await enqueue.execute({ message: message(1) });
    await useCase.execute();

    expect(llm.calls).toBe(1);
    expect(publisher.publishedTexts).toEqual(['refined post']);
  });

  it('publishes raw when llmEnabled=true but publishingEnabled=false at direct invocation', async () => {
    // Scheduler gates publishingEnabled; a direct call must still not
    // burn LLM budget when publishing is paused.
    const { enqueue, useCase, publisher, llm } = setup({
      config: { llmEnabled: true, publishingEnabled: false },
    });

    await enqueue.execute({ message: message(1) });
    await useCase.execute();

    expect(llm.calls).toBe(0);
    expect(publisher.publishedTexts).toEqual([
      'bitcoin ETF inflows hit record',
    ]);
  });

  it('BLOCKED path: blocking failure → FAILED with the reason (terminal, no retry)', async () => {
    const { queueRepo, enqueue, useCase } = setup({
      publishBehavior: () => failureResult('Content violates policy', false),
    });
    expect(isBlockingFailureReason('Content violates policy')).toBe(true);

    const entry = await enqueue.execute({ message: message(1) });
    await useCase.execute();

    const after = await queueRepo.findById(entry!.id);
    expect(after!.status).toBe('FAILED');
    expect(after!.lastError).toBe('Content violates policy');
    expect(after!.attempts).toBe(0);
  });

  it('transient failure consumes the retry budget before going FAILED', async () => {
    const { queueRepo, enqueue, useCase } = setup({
      config: { llmMaxAttempts: 3 },
      publishBehavior: () => failureResult('Rate limit exceeded', true),
    });

    const entry = await enqueue.execute({ message: message(1) });
    await useCase.execute();
    expect((await queueRepo.findById(entry!.id))!.status).toBe('PENDING');
    expect((await queueRepo.findById(entry!.id))!.attempts).toBe(1);

    await useCase.execute();
    expect((await queueRepo.findById(entry!.id))!.attempts).toBe(2);

    await useCase.execute();
    const after = await queueRepo.findById(entry!.id);
    expect(after!.status).toBe('FAILED');
    expect(after!.lastError).toBe('Rate limit exceeded');
  });

  it('dailyCap blocks the drain once reached (default 60)', async () => {
    const { enqueue, useCase, queueRepo } = setup({
      config: { dailyCap: 1 },
    });

    await enqueue.execute({ message: message(1) });
    await enqueue.execute({ message: message(2) });
    await useCase.execute();
    await useCase.execute();

    expect(await queueRepo.countPublishedToday(4)).toBe(1);
    expect(await queueRepo.countPending()).toBe(1);
  });

  it('does nothing when the queue is empty', async () => {
    const { useCase, publisher } = setup();
    await useCase.execute();
    expect(publisher.publishedTexts).toEqual([]);
  });
});
