import { DomainError } from 'shared/kernel/domain-error';
import { InMemoryScheduledPostRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduled-post.repository';
import { InMemorySessionAuthorizer } from '../../infrastructure/sessions/in-memory-session.authorizer';
import { InMemoryContentRefResolver } from '../../infrastructure/content/in-memory-content-ref.resolver';
import { InMemoryPublishRateLimiter } from '../../infrastructure/rate-limit/in-memory-publish-rate-limiter';
import { SchedulePostUseCase } from './schedule-post.use-case';
import type { SessionRecord } from '../../domain/ports/session-binding.authorizer';

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'morning-desk',
    active: true,
    bindings: [
      {
        bindingId: 'b-1',
        target: 'telegram',
        botId: 'bot_X',
        defaultChatId: '-100123',
        botVerified: true,
        publishDelayMs: 0,
        dailyCap: 10,
      },
    ],
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: 'morning-desk',
    binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100123' },
    content: { kind: 'pre-written', text: 'GM', mediaIds: [], buttons: null },
    scheduleKind: { kind: 'once', fireAt: '2026-09-27T08:00:00.000Z' },
    idempotencyKey: '3f6b4c2a-0000-4000-8000-000000000001',
    ...overrides,
  } as Record<string, unknown>;
}

async function harness() {
  const posts = new InMemoryScheduledPostRepository();
  const sessions = new InMemorySessionAuthorizer();
  await sessions.seed(session());
  const refs = new InMemoryContentRefResolver();
  const limiter = new InMemoryPublishRateLimiter();
  const useCase = new SchedulePostUseCase(posts, sessions, refs, limiter);
  return { posts, sessions, refs, limiter, useCase };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_THROW';
  } catch (err) {
    return err instanceof DomainError ? err.code : `WRONG:${String(err)}`;
  }
}

describe('SchedulePostUseCase', () => {
  it('creates once + cron posts (201 class, state scheduled)', async () => {
    const { useCase } = await harness();
    const once = await useCase.execute(request() as never);
    expect(once.created).toBe(true);
    expect(once.post.state).toBe('scheduled');
    const cron = await useCase.execute(
      request({
        scheduleKind: { kind: 'cron', cronExpr: '0 8 * * *', timezone: 'UTC' },
        idempotencyKey: '3f6b4c2a-0000-4000-8000-000000000002',
      }) as never,
    );
    expect(cron.created).toBe(true);
  });

  it('replays duplicate idempotency keys with the ORIGINAL record (same session)', async () => {
    const { useCase } = await harness();
    const first = await useCase.execute(request() as never);
    const replay = await useCase.execute(request() as never);
    expect(replay.created).toBe(false);
    expect(replay.post.id).toBe(first.post.id);
  });

  it('rejects unknown sessions (404), inactive sessions (409) and binding-less sessions (409 NO_ACTIVE_TARGET)', async () => {
    const { useCase, sessions } = await harness();
    await sessions.seed(session({ sessionId: 'closed', active: false }));
    await sessions.seed(session({ sessionId: 'bare', bindings: [] }));
    expect(
      await codeOf(useCase.execute(request({ sessionId: 'ghost' }) as never)),
    ).toBe('NOT_FOUND');
    expect(
      await codeOf(useCase.execute(request({ sessionId: 'closed' }) as never)),
    ).toBe('CONFLICT');
    expect(
      await codeOf(useCase.execute(request({ sessionId: 'bare' }) as never)),
    ).toBe('CONFLICT');
  });

  it('rejects unowned bindings, unverified bots and channel hijacks (403, no existence leak)', async () => {
    const { useCase } = await harness();
    expect(
      await codeOf(
        useCase.execute(
          request({
            binding: { target: 'telegram', bindingId: 'b-9', botId: 'bot_X', chatId: '-100123' },
          }) as never,
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await codeOf(
        useCase.execute(
          request({
            binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_Y', chatId: '-100123' },
          }) as never,
        ),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await codeOf(
        useCase.execute(
          request({
            binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100999' },
          }) as never,
        ),
      ),
    ).toBe('FORBIDDEN');
  });

  it('rejects past fireAt, bad cron, non-UTC timezone and unknown content-refs (422 class)', async () => {
    const { useCase } = await harness();
    expect(
      await codeOf(
        useCase.execute(
          request({ scheduleKind: { kind: 'once', fireAt: '2020-01-01T00:00:00.000Z' } }) as never,
        ),
      ),
    ).toBe('SCHEDULE_INVALID');
    expect(
      await codeOf(
        useCase.execute(
          request({ scheduleKind: { kind: 'cron', cronExpr: 'nope', timezone: 'UTC' } }) as never,
        ),
      ),
    ).toBe('SCHEDULE_INVALID');
    expect(
      await codeOf(
        useCase.execute(
          request({
            scheduleKind: { kind: 'cron', cronExpr: '0 8 * * *', timezone: 'Europe/Madrid' },
          }) as never,
        ),
      ),
    ).toBe('SCHEDULE_INVALID');
    expect(
      await codeOf(
        useCase.execute(
          request({ content: { kind: 'content-ref', queueEntryId: 'missing' } }) as never,
        ),
      ),
    ).toBe('SCHEDULE_INVALID');
  });

  it('rate-limits bursts (429) without burning idempotency keys', async () => {
    const posts = new InMemoryScheduledPostRepository();
    const sessions = new InMemorySessionAuthorizer();
    await sessions.seed(session());
    const useCase = new SchedulePostUseCase(
      posts,
      sessions,
      new InMemoryContentRefResolver(),
      new InMemoryPublishRateLimiter({
        get: () => '1',
      } as never),
    );
    await useCase.execute(request() as never);
    expect(
      await codeOf(
        useCase.execute(
          request({ idempotencyKey: '3f6b4c2a-0000-4000-8000-000000000009' }) as never,
        ),
      ),
    ).toBe('RATE_LIMITED');
    expect(await posts.findBySessionKey('morning-desk', '3f6b4c2a-0000-4000-8000-000000000009')).toBeNull();
  });
});
