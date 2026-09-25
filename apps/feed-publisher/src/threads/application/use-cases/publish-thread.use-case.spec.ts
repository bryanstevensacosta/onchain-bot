import { Thread } from '../../domain/entities/thread.entity';
import type { ThreadMessagePublishOutcome } from '../../domain/ports/thread-message-publisher.port';
import { ThreadMessagePublisherPort } from '../../domain/ports/thread-message-publisher.port';
import { ThreadSchedulerService } from '../services/thread-scheduler.service';
import { PublishThreadUseCase } from './publish-thread.use-case';
import { InMemoryThreadRepository } from '../../infrastructure/persistence/in-memory/in-memory-thread.repository';

/** Scripted fake: per-index outcomes, records every attempted publish. */
class ScriptedPublisher extends ThreadMessagePublisherPort {
  public readonly attempted: number[] = [];
  public constructor(
    private readonly script: Record<number, ThreadMessagePublishOutcome>,
  ) {
    super();
  }
  public async publish(input: {
    threadId: string;
    index: number;
    content: string;
  }): Promise<ThreadMessagePublishOutcome> {
    void input.content;
    this.attempted.push(input.index);
    return (
      this.script[input.index] ?? {
        outcome: 'ok',
        remoteId: `remote-${input.index}`,
      }
    );
  }
}

const AT = new Date('2026-09-25T10:00:00.000Z');

async function makeQueued(
  messages: Array<{ content: string; delaySeconds?: number }>,
): Promise<{ repo: InMemoryThreadRepository; id: string }> {
  const repo = new InMemoryThreadRepository();
  const thread = Thread.create({ id: 't1', messages, createdAt: AT });
  thread.enqueue();
  await repo.save(thread);
  return { repo, id: thread.id };
}

function makePublish(
  repo: InMemoryThreadRepository,
  publisher: ThreadMessagePublisherPort,
): PublishThreadUseCase {
  return new PublishThreadUseCase(
    repo,
    publisher,
    new ThreadSchedulerService(),
  );
}

describe('PublishThreadUseCase partial-publish matrix', () => {
  it('publishes every message -> COMPLETED', async () => {
    const { repo, id } = await makeQueued([
      { content: 'one' },
      { content: 'two' },
    ]);
    const publisher = new ScriptedPublisher({});
    const result = await makePublish(repo, publisher).execute(id, AT);
    expect(result.status).toBe('COMPLETED');
    expect(result.publishedIndexes).toEqual([0, 1]);
    expect(publisher.attempted).toEqual([0, 1]);
    expect((await repo.findById(id))?.status).toBe('COMPLETED');
  });

  it('PARTIAL: message 1 ok, message 2 transient -> retry resumes from message 2', async () => {
    const { repo, id } = await makeQueued([
      { content: 'one' },
      { content: 'two' },
    ]);
    const failing = new ScriptedPublisher({
      1: { outcome: 'transient', reason: 'rate limited' },
    });
    const first = await makePublish(repo, failing).execute(id, AT);
    expect(first.status).toBe('PARTIAL');
    expect(first.publishedIndexes).toEqual([0]);
    // Retry after the backoff hold re-attempts ONLY message 2.
    const retry = new ScriptedPublisher({});
    const stored = await repo.findById(id);
    const afterBackoff = new Date(
      (stored?.nextAttemptAt ?? AT).getTime() + 1,
    );
    const second = await makePublish(repo, retry).execute(id, afterBackoff);
    expect(second.status).toBe('COMPLETED');
    expect(second.publishedIndexes).toEqual([1]);
    expect(retry.attempted).toEqual([1]);
  });

  it('FAILED: critical failure is terminal, never retried', async () => {
    const { repo, id } = await makeQueued([
      { content: 'one' },
      { content: 'two' },
    ]);
    const critical = new ScriptedPublisher({
      0: { outcome: 'critical', reason: 'bad token' },
    });
    const first = await makePublish(repo, critical).execute(id, AT);
    expect(first.status).toBe('FAILED');
    expect(first.failureReason).toBe('bad token');
    const retry = new ScriptedPublisher({});
    const second = await makePublish(repo, retry).execute(id, AT);
    expect(second.status).toBe('FAILED');
    expect(second.skipped).toBe('terminal');
    expect(retry.attempted).toEqual([]);
  });

  it('IN_PROGRESS: transient on the first message holds backoff, skips early ticks', async () => {
    const { repo, id } = await makeQueued([
      { content: 'one' },
      { content: 'two' },
    ]);
    const flaky = new ScriptedPublisher({
      0: { outcome: 'transient', reason: 'rate limited' },
    });
    const first = await makePublish(repo, flaky).execute(id, AT);
    expect(first.status).toBe('IN_PROGRESS');
    expect(first.publishedIndexes).toEqual([]);
    const stored = await repo.findById(id);
    expect(stored?.attempts).toBe(1);
    // A tick inside the backoff window attempts nothing.
    const early = new ScriptedPublisher({});
    const skipped = await makePublish(repo, early).execute(id, AT);
    expect(skipped.skipped).toBe('backoff');
    expect(early.attempted).toEqual([]);
  });

  it('COMPLETED threads are never republished', async () => {
    const { repo, id } = await makeQueued([{ content: 'solo' }]);
    const once = new ScriptedPublisher({});
    await makePublish(repo, once).execute(id, AT);
    const again = new ScriptedPublisher({});
    const second = await makePublish(repo, again).execute(id, AT);
    expect(second.status).toBe('COMPLETED');
    expect(second.skipped).toBe('terminal');
    expect(again.attempted).toEqual([]);
  });

  it('waits for per-message delays without burning attempts', async () => {
    const { repo, id } = await makeQueued([
      { content: 'first', delaySeconds: 0 },
      { content: 'second', delaySeconds: 3600 },
    ]);
    const publisher = new ScriptedPublisher({});
    const first = await makePublish(repo, publisher).execute(id, AT);
    expect(first.publishedIndexes).toEqual([0]);
    expect(first.status).toBe('IN_PROGRESS');
    expect((await repo.findById(id))?.attempts).toBe(0);
    // After the delay elapses the second message goes out.
    const later = new Date(AT.getTime() + 3600 * 1000);
    const second = await makePublish(repo, publisher).execute(id, later);
    expect(second.status).toBe('COMPLETED');
    expect(second.publishedIndexes).toEqual([1]);
  });

  it('404s on unknown threads', async () => {
    const repo = new InMemoryThreadRepository();
    await expect(
      makePublish(repo, new ScriptedPublisher({})).execute('missing', AT),
    ).rejects.toThrow('not found');
  });
});
