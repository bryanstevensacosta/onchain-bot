import { TargetDispatcherService } from './application/services/target-dispatcher.service';
import { ThreadsPublisherHttpClient } from './infrastructure/threads/threads-publisher-http-client';
import { createTargetBinding, isTargetKind } from './domain/target-binding';

function fakeGateway() {
  const calls: Array<{ botId: string; chatId: string; text: string }> = [];
  return {
    calls,
    mapping: {
      resolveGatewayId: (localId: string): string => `vault:${localId}`,
    },
    sender: {
      sendViaGateway: async (input: {
        botId: string;
        chatId: string;
        text: string;
      }): Promise<{
        ok: boolean;
        messageId: number | null;
        error: string | null;
      }> => {
        calls.push({
          botId: input.botId,
          chatId: input.chatId,
          text: input.text,
        });
        return { ok: true, messageId: 7, error: null };
      },
    },
  };
}

describe('feed-publisher target dispatcher (todo 10)', () => {
  it('rejects unknown binding targets', () => {
    expect(isTargetKind('sms')).toBe(false);
    expect(() =>
      createTargetBinding({
        target: 'sms' as never,
        botId: 'b1',
        chatId: 'c1',
      }),
    ).toThrow('unknown target');
  });

  it('validates per-binding config (P38-bis)', () => {
    const binding = createTargetBinding({
      target: 'telegram',
      botId: 'b1',
      chatId: '@chan',
      publishDelayMs: 60_000,
      dailyCap: 10,
    });
    expect(binding.publishDelayMs).toBe(60_000);
    expect(binding.dailyCap).toBe(10);
    expect(() =>
      createTargetBinding({
        target: 'telegram',
        botId: 'b1',
        chatId: '@c',
        dailyCap: -1,
      }),
    ).toThrow('dailyCap');
    expect(() =>
      createTargetBinding({ target: 'threads', botId: '', chatId: '@c' }),
    ).toThrow('botId');
  });

  it('routes telegram bindings via the gateway with vault ids', async () => {
    const fake = fakeGateway();
    const dispatcher = new TargetDispatcherService(
      fake.sender,
      fake.mapping as never,
      undefined,
    );
    const result = await dispatcher.dispatch({
      target: 'telegram',
      botId: 'local-bot',
      chatId: '@chan',
      content: 'hello',
      mode: 'raw',
    });
    expect(result).toEqual({ ok: true, remoteId: '7' });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.botId).toBe('vault:local-bot');
  });

  it('routes threads bindings to the threads-publisher HTTP client', async () => {
    const client = {
      enqueue: async (): Promise<{ ok: true; remoteId: string }> => ({
        ok: true as const,
        remoteId: 'thread-1',
      }),
    };
    const dispatcher = new TargetDispatcherService(
      undefined,
      undefined,
      client as unknown as ThreadsPublisherHttpClient,
    );
    const result = await dispatcher.dispatch({
      target: 'threads',
      botId: 'tb',
      chatId: '@threads-chan',
      content: 'hello threads',
      mode: 'llm',
    });
    expect(result).toEqual({ ok: true, remoteId: 'thread-1' });
  });

  it('fails closed when the leg is unwired (no throw at dispatch site)', async () => {
    const dispatcher = new TargetDispatcherService(
      undefined,
      undefined,
      undefined,
    );
    const telegram = await dispatcher.dispatch({
      target: 'telegram',
      botId: 'b',
      chatId: 'c',
      content: 'x',
      mode: 'raw',
    });
    expect(telegram.ok).toBe(false);
    const threads = await dispatcher.dispatch({
      target: 'threads',
      botId: 'b',
      chatId: 'c',
      content: 'x',
      mode: 'raw',
    });
    expect(threads.ok).toBe(false);
  });

  it('holds sends when the per-binding cap is exhausted (P38)', () => {
    const dispatcher = new TargetDispatcherService(
      undefined,
      undefined,
      undefined,
    );
    const binding = { botId: 'b1', target: 'telegram' as const };
    const now = new Date('2026-09-27T10:00:00.000Z');
    dispatcher.markSent(binding, now);
    expect(
      dispatcher.pacingAllows(
        binding,
        { publishDelayMs: 60_000, dailyCap: 1 },
        new Date('2026-09-27T10:00:30.000Z'),
      ),
    ).toBe(false);
    expect(
      dispatcher.pacingAllows(
        binding,
        { publishDelayMs: 60_000, dailyCap: 1 },
        new Date('2026-09-28T10:00:30.000Z'),
      ),
    ).toBe(true);
  });
});
