import { Thread } from '../../domain/entities/thread.entity';
import { ThreadMessagePublisherPort } from '../../domain/ports/thread-message-publisher.port';
import { ThreadSchedulerService } from '../services/thread-scheduler.service';
import { PublishThreadUseCase } from '../use-cases/publish-thread.use-case';
import { ThreadPublisherCronScheduler } from './thread-publisher-cron.scheduler';
import { ThreadsHealthState } from '../state/threads-health.state';
import { InMemoryThreadRepository } from '../../infrastructure/persistence/in-memory/in-memory-thread.repository';
import { InMemoryThreadMessagePublisher } from '../../infrastructure/dispatch/in-memory-thread-message.publisher';

const AT = new Date('2026-09-25T10:00:00.000Z');

function makeHarness() {
  const repo = new InMemoryThreadRepository();
  const publisher = new InMemoryThreadMessagePublisher();
  const schedulerService = new ThreadSchedulerService();
  const publish = new PublishThreadUseCase(repo, publisher, schedulerService);
  const health = new ThreadsHealthState();
  const scheduler = new ThreadPublisherCronScheduler(
    publish,
    repo,
    health,
    { addCronJob: jest.fn(), getCronJob: jest.fn() } as never,
    { get: () => 'true' } as never,
  );
  return { repo, publisher, publish, health, scheduler };
}

async function saveQueued(
  repo: InMemoryThreadRepository,
  id: string,
  messages: Array<{ content: string }>,
): Promise<void> {
  const thread = Thread.create({ id, messages, createdAt: AT });
  thread.enqueue();
  await repo.save(thread);
}

describe('ThreadPublisherCronScheduler', () => {
  it('publishes due QUEUED threads and records the tick', async () => {
    const { repo, publisher, health, scheduler } = makeHarness();
    await saveQueued(repo, 't1', [{ content: 'one' }]);
    await scheduler.tick(AT);
    expect(publisher.sent).toHaveLength(1);
    expect(health.lastTickAt).toBe(AT.toISOString());
    expect(health.consecutiveFailures).toBe(0);
  });

  it('does nothing when THREADS_CRON_ENABLED is false', async () => {
    const { repo, publisher, health } = makeHarness();
    await saveQueued(repo, 't1', [{ content: 'one' }]);
    const disabled = new ThreadPublisherCronScheduler(
      new PublishThreadUseCase(
        repo,
        publisher,
        new ThreadSchedulerService(),
      ),
      repo,
      health,
      { addCronJob: jest.fn(), getCronJob: jest.fn() } as never,
      { get: () => 'false' } as never,
    );
    await disabled.tick(AT);
    expect(publisher.sent).toHaveLength(0);
  });

  it('skips overlapping ticks', async () => {
    const { repo, publisher, health, scheduler } = makeHarness();
    await saveQueued(repo, 't1', [{ content: 'one' }]);
    const first = scheduler.tick(AT);
    const second = scheduler.tick(AT);
    await Promise.all([first, second]);
    expect(publisher.sent).toHaveLength(1);
    expect(health.lastTickAt).toBe(AT.toISOString());
  });

  it('skips DRAFT threads (never enqueued)', async () => {
    const { repo, publisher, scheduler } = makeHarness();
    await repo.save(Thread.create({ id: 'draft', messages: [{ content: 'x' }] }));
    await scheduler.tick(AT);
    expect(publisher.sent).toHaveLength(0);
  });

  it('records failures without killing the tick', async () => {
    const { repo, health, scheduler } = makeHarness();
    await saveQueued(repo, 't1', [{ content: 'one' }]);
    const exploding = {
      execute: async () => {
        throw new Error('store down');
      },
    } as unknown as PublishThreadUseCase;
    const failing = new ThreadPublisherCronScheduler(
      exploding,
      repo,
      health,
      { addCronJob: jest.fn(), getCronJob: jest.fn() } as never,
      { get: () => 'true' } as never,
    );
    await failing.tick(AT);
    expect(health.consecutiveFailures).toBe(1);
    expect(health.lastError).toBe('store down');
    expect(scheduler).toBeDefined();
  });

  it('registers a per-minute cron job on bootstrap', async () => {
    const { scheduler } = makeHarness();
    const registry = {
      addCronJob: jest.fn(),
      getCronJob: jest.fn(),
    } as never;
    const withRegistry = new ThreadPublisherCronScheduler(
      new PublishThreadUseCase(
        new InMemoryThreadRepository(),
        new InMemoryThreadMessagePublisher(),
        new ThreadSchedulerService(),
      ),
      new InMemoryThreadRepository(),
      new ThreadsHealthState(),
      registry,
      { get: () => 'true' } as never,
    );
    await withRegistry.onApplicationBootstrap();
    expect(
      (registry as { addCronJob: jest.Mock }).addCronJob,
    ).toHaveBeenCalledWith(
      'feed-threads-publisher',
      expect.objectContaining({ start: expect.any(Function) }),
    );
    expect(scheduler).toBeDefined();
  });

  it('ThreadMessagePublisherPort is injectable as a token', () => {
    expect(ThreadMessagePublisherPort).toBeDefined();
  });
});
