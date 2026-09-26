import { InMemoryScheduledPostRepository } from '../../infrastructure/persistence/in-memory/in-memory-scheduled-post.repository';
import { InMemorySessionAuthorizer } from '../../infrastructure/sessions/in-memory-session.authorizer';
import { InMemoryContentRefResolver } from '../../infrastructure/content/in-memory-content-ref.resolver';
import { InMemoryCallbackRecorder } from '../../infrastructure/callbacks/in-memory-callback.recorder';
import { InMemorySchedulingConfigRepository } from 'scheduling/infrastructure/persistence/in-memory/in-memory-scheduling-config.repository';
import { InMemorySchedulingStateRepository } from 'scheduling/infrastructure/persistence/in-memory/in-memory-scheduling-state.repository';
import { InMemoryAdMediaLibraryRepository } from 'scheduling/infrastructure/persistence/in-memory/in-memory-ad-media-library.repository';
import { SchedulingConfig } from 'scheduling/domain/scheduling-config.entity';
import { ScheduledPost } from '../../domain/scheduled-post.entity';
import type { SessionRecord } from '../../domain/ports/session-binding.authorizer';
import type { TelegramSendResult } from 'telegram/domain/ports/telegram-send-result';
import { FireDuePostsUseCase } from './fire-due-posts.use-case';

const BINDING = {
  bindingId: 'b-1',
  target: 'telegram' as const,
  botId: 'bot_X',
  defaultChatId: '-100123',
  botVerified: true,
  publishDelayMs: 0,
  dailyCap: 10,
};

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return { sessionId: 'morning-desk', active: true, bindings: [BINDING], ...overrides };
}

function oncePost(sessionId = 'morning-desk', fireAt = '2026-09-27T08:00:00.000Z'): ScheduledPost {
  return ScheduledPost.create({
    sessionId,
    binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100123' },
    content: { kind: 'pre-written', text: 'GM', mediaIds: [], buttons: null },
    scheduleKind: { kind: 'once', fireAt },
    idempotencyKey: `k-${Math.random().toString(36).slice(2)}`,
  });
}

interface FireHarness {
  posts: InMemoryScheduledPostRepository;
  sessions: InMemorySessionAuthorizer;
  callbacks: InMemoryCallbackRecorder;
  states: InMemorySchedulingStateRepository;
  configs: InMemorySchedulingConfigRepository;
  fire: FireDuePostsUseCase;
  sent: Array<{ botId: string; chatId: string; text: string }>;
}

async function harness(
  gatewayResult: TelegramSendResult = { ok: true, messageId: 777, error: null },
): Promise<FireHarness> {
  const posts = new InMemoryScheduledPostRepository();
  const sessions = new InMemorySessionAuthorizer();
  await sessions.seed(session());
  const configs = new InMemorySchedulingConfigRepository();
  await configs.save(SchedulingConfig.load({}));
  const states = new InMemorySchedulingStateRepository();
  const callbacks = new InMemoryCallbackRecorder();
  const sent: FireHarness['sent'] = [];
  const dispatcher = {
    publishScheduledPost: jest.fn().mockImplementation((input: { botId: string; chatId: string; text: string }) => {
      sent.push({ botId: input.botId, chatId: input.chatId, text: input.text });
      return Promise.resolve(gatewayResult);
    }),
  } as never;
  const fire = new FireDuePostsUseCase(
    posts,
    sessions,
    new InMemoryContentRefResolver(),
    configs,
    states,
    new InMemoryAdMediaLibraryRepository(),
    dispatcher,
    callbacks,
    undefined,
  );
  return { posts, sessions, callbacks, states, configs, fire, sent };
}

const TICK = new Date('2026-09-27T08:00:30.000Z');

describe('FireDuePostsUseCase', () => {
  it('fires due once posts via the gateway vault id and emits the fired callback', async () => {
    const { posts, callbacks, fire, sent } = await harness();
    const post = await posts.save(oncePost());
    const fired = await fire.fireDue(TICK);
    expect(fired).toHaveLength(1);
    const after = (await posts.findById(post.id))!;
    expect(after.state).toBe('fired');
    expect(after.messageId).toBe(777);
    expect(sent).toEqual([{ botId: 'bot_X', chatId: '-100123', text: 'GM' }]);
    expect(callbacks.emitted).toHaveLength(1);
    expect(callbacks.emitted[0]).toMatchObject({
      scheduledPostId: post.id,
      state: 'fired',
      messageId: '777',
      reason: null,
    });
  });

  it('holds posts when the per-target delay is not met (HELD_DELAY, sibling unaffected)', async () => {
    const { posts, fire, sent } = await harness();
    await posts.save(oncePost());
    const first = await fire.fireDue(new Date('2026-09-27T08:00:30.000Z'));
    expect(first).toHaveLength(1);
    const second = await fire.fireDue(new Date('2026-09-27T08:00:31.000Z'));
    expect(second).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  it('holds posts when the daily cap is reached (HELD_DAILY_CAP, never dropped)', async () => {
    const h = await harness();
    await h.configs.save(
      SchedulingConfig.load({ telegram: { publishDelayMs: 0, dailyCap: 1 } }),
    );
    await h.posts.save(oncePost());
    await h.fire.fireDue(TICK);
    const capped = await h.posts.save(
      ScheduledPost.create({
        sessionId: 'morning-desk',
        binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100123' },
        content: { kind: 'pre-written', text: 'two', mediaIds: [], buttons: null },
        scheduleKind: { kind: 'once', fireAt: '2026-09-27T08:00:00.000Z' },
        idempotencyKey: 'k-cap-2',
      }),
    );
    const out = await h.fire.fireDue(new Date('2026-09-27T08:01:30.000Z'));
    expect(out).toHaveLength(0);
    expect((await h.posts.findById(capped.id))!.state).toBe('scheduled');
    expect(h.sent).toHaveLength(1);
  });

  it('enforces binding-proposed caps (session tightens) and pauses on dailyCap 0', async () => {
    const h = await harness();
    await h.sessions.seed(
      session({
        sessionId: 'tight',
        bindings: [{ ...BINDING, publishDelayMs: 0, dailyCap: 1 }],
      }),
    );
    await h.posts.save(oncePost('tight'));
    await h.fire.fireDue(TICK);
    expect(h.sent).toHaveLength(1);
    const held = await h.posts.save(
      ScheduledPost.create({
        sessionId: 'tight',
        binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100123' },
        content: { kind: 'pre-written', text: 'held', mediaIds: [], buttons: null },
        scheduleKind: { kind: 'once', fireAt: '2026-09-27T08:00:00.000Z' },
        idempotencyKey: 'k-tight-2',
      }),
    );
    await h.fire.fireDue(new Date('2026-09-27T09:00:30.000Z'));
    expect(h.sent).toHaveLength(1);
    expect((await h.posts.findById(held.id))!.state).toBe('scheduled');

    await h.sessions.seed(
      session({
        sessionId: 'paused',
        bindings: [{ ...BINDING, publishDelayMs: 0, dailyCap: 0 }],
      }),
    );
    const paused = await h.posts.save(oncePost('paused'));
    await h.fire.fireDue(new Date('2026-09-27T10:00:30.000Z'));
    expect((await h.posts.findById(paused.id))!.state).toBe('scheduled');
    expect(h.sent).toHaveLength(1);
  });

  it('keeps gateway-down posts scheduled (TARGET_DOWN transient, fired only with a messageId)', async () => {
    const { posts, callbacks, fire } = await harness({
      ok: false,
      messageId: null,
      error: 'gateway send failed (http 502)',
    });
    const post = await posts.save(oncePost());
    await fire.fireDue(TICK);
    expect((await posts.findById(post.id))!.state).toBe('scheduled');
    expect(callbacks.emitted).toHaveLength(0);
  });

  it('fails revoked bots and hijacked channels at fire time (BOT_REVOKED / CHANNEL_MISMATCH)', async () => {
    const revoked = await harness();
    await revoked.sessions.seed(
      session({ sessionId: 'rev', bindings: [{ ...BINDING, botVerified: false }] }),
    );
    const rp = await revoked.posts.save(oncePost('rev'));
    await revoked.fire.fireDue(TICK);
    expect((await revoked.posts.findById(rp.id))!.state).toBe('failed');
    expect((await revoked.posts.findById(rp.id))!.reason).toBe('BOT_REVOKED');
    expect(revoked.callbacks.emitted[0]).toMatchObject({ state: 'failed', reason: 'BOT_REVOKED' });

    const hijacked = await harness();
    await hijacked.sessions.seed(
      session({ sessionId: 'hij', bindings: [{ ...BINDING, defaultChatId: '-100555' }] }),
    );
    const hp = await hijacked.posts.save(oncePost('hij'));
    await hijacked.fire.fireDue(TICK);
    expect((await hijacked.posts.findById(hp.id))!.state).toBe('failed');
    expect((await hijacked.posts.findById(hp.id))!.reason).toBe('CHANNEL_MISMATCH');
  });

  it('cancels posts of closed sessions (SESSION_CLOSED) and fails missing media (MEDIA_MISSING)', async () => {
    const { posts, callbacks, fire, sessions } = await harness();
    await sessions.seed(session({ sessionId: 'dead', active: false, bindings: [BINDING] }));
    const dp = await posts.save(oncePost('dead'));
    const mp = await posts.save(
      ScheduledPost.create({
        sessionId: 'morning-desk',
        binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100123' },
        content: { kind: 'pre-written', text: 'pic', mediaIds: ['ghost-media'], buttons: null },
        scheduleKind: { kind: 'once', fireAt: '2026-09-27T08:00:00.000Z' },
        idempotencyKey: 'k-media-1',
      }),
    );
    await fire.fireDue(TICK);
    expect((await posts.findById(dp.id))!.state).toBe('cancelled');
    expect((await posts.findById(dp.id))!.reason).toBe('SESSION_CLOSED');
    expect((await posts.findById(mp.id))!.state).toBe('failed');
    expect((await posts.findById(mp.id))!.reason).toBe('MEDIA_MISSING');
    expect(callbacks.emitted.map((c) => c.reason)).toEqual(
      expect.arrayContaining(['SESSION_CLOSED', 'MEDIA_MISSING']),
    );
  });

  it('fires cron posts every due minute and keeps them scheduled (recurring)', async () => {
    const { posts, fire, sent } = await harness();
    const post = await posts.save(
      ScheduledPost.create({
        sessionId: 'morning-desk',
        binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100123' },
        content: { kind: 'pre-written', text: 'daily', mediaIds: [], buttons: null },
        scheduleKind: { kind: 'cron', cronExpr: '0 8 * * *', timezone: 'UTC' },
        idempotencyKey: 'k-cron-1',
      }),
    );
    await fire.fireDue(new Date('2026-09-27T08:00:30.000Z'));
    expect(sent).toHaveLength(1);
    expect((await posts.findById(post.id))!.state).toBe('scheduled');
    await fire.fireDue(new Date('2026-09-28T08:00:30.000Z'));
    expect(sent).toHaveLength(2);
    expect((await posts.findById(post.id))!.state).toBe('scheduled');
  });

  it('publish-now bypasses delay/cap but still enforces auth and emits the callback', async () => {
    const { posts, callbacks, fire, sent } = await harness();
    const post = await posts.save(oncePost());
    await fire.fireDue(TICK);
    const second = await posts.save(
      ScheduledPost.create({
        sessionId: 'morning-desk',
        binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100123' },
        content: { kind: 'pre-written', text: 'now', mediaIds: [], buttons: null },
        scheduleKind: { kind: 'once', fireAt: '2026-09-27T09:00:00.000Z' },
        idempotencyKey: 'k-now-1',
      }),
    );
    const out = await fire.publishNow(second.id, 'morning-desk');
    expect(out.state).toBe('fired');
    expect(sent).toHaveLength(2);
    expect(callbacks.emitted).toHaveLength(2);
    await expect(fire.publishNow(post.id, 'morning-desk')).rejects.toThrow(/terminal/);
    const third = await posts.save(
      ScheduledPost.create({
        sessionId: 'morning-desk',
        binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100123' },
        content: { kind: 'pre-written', text: 'third', mediaIds: [], buttons: null },
        scheduleKind: { kind: 'once', fireAt: '2026-09-27T09:00:00.000Z' },
        idempotencyKey: 'k-now-2',
      }),
    );
    await expect(fire.publishNow(third.id, 'intruder')).rejects.toThrow(/owner/);
  });
});
