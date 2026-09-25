import { MultiBotPublisherAdapter } from './multi-bot-publisher.adapter';

describe('MultiBotPublisherAdapter (todo 11, failing-first)', () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let adapter: MultiBotPublisherAdapter;

  beforeEach(() => {
    calls.length = 0;
    adapter = new MultiBotPublisherAdapter();
    (global as unknown as { fetch: unknown }).fetch = async (
      url: string,
      init: { body: string },
    ) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push({ url, body });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 11 } }),
      };
    };
  });

  afterEach(() => {
    delete (global as unknown as { fetch?: unknown }).fetch;
  });

  it('sends via the per-call catalog token (no env binding)', async () => {
    const res = await adapter.sendMessage({
      botToken: 'AAA',
      chatId: '@mirror',
      text: 'hi $BONK',
    });
    expect(res).toMatchObject({ ok: true, messageId: 11 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/botAAA/sendMessage');
    expect(calls[0].body.chat_id).toBe('@mirror');
  });

  it('rejects empty messages without touching the network', async () => {
    const res = await adapter.sendMessage({
      botToken: 'AAA',
      chatId: '@mirror',
      text: '',
    });
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('chunks messages over 4096 chars', async () => {
    const res = await adapter.sendMessage({
      botToken: 'AAA',
      chatId: '@mirror',
      text: 'x'.repeat(5000),
    });
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });
});
