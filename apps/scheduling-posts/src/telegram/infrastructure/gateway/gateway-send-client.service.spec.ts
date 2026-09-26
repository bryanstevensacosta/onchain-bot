import { GatewaySendClient } from './gateway-send-client.service';
import type { SchedulingGatewaySendInput } from '../../domain/ports/scheduling-gateway-sender.port';

function input(
  overrides: Partial<SchedulingGatewaySendInput> = {},
): SchedulingGatewaySendInput {
  return {
    botId: 'vault-bot-1',
    chatId: '-100123',
    kind: 'message',
    text: 'hello',
    ...overrides,
  };
}

describe('GatewaySendClient', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  function mockFetchOnce(payload: unknown, status = 200): jest.Mock {
    const mock = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload),
    });
    global.fetch = mock as unknown as typeof fetch;
    return mock;
  }

  it('rejects empty text without touching the network', async () => {
    const client = new GatewaySendClient();
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const out = await client.sendViaGateway(input({ text: '' }));
    expect(out).toMatchObject({ ok: false, messageId: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts one message chunk and returns the gateway message id', async () => {
    const fetchMock = mockFetchOnce({ ok: true, message_id: 777 });
    const client = new GatewaySendClient();
    const out = await client.sendViaGateway(
      input({ clientMsgId: 'sp_01' }),
    );
    expect(out).toEqual({ ok: true, messageId: 777, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4070/api/bots/vault-bot-1/send');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ kind: 'message', client_msg_id: 'sp_01' });
  });

  it('splits 4096+ char texts into suffixed chunks', async () => {
    const fetchMock = mockFetchOnce({ ok: true, message_id: 1 });
    const client = new GatewaySendClient();
    const out = await client.sendViaGateway(
      input({ text: 'x'.repeat(5000), clientMsgId: 'sp_02' }),
    );
    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(second.client_msg_id).toBe('sp_02:chunk:1');
  });

  it('rejects gateway-incompatible shapes fail-closed (no network)', async () => {
    const client = new GatewaySendClient();
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const photoLocal = await client.sendViaGateway(
      input({ kind: 'photo', text: 'cap' }),
    );
    expect(photoLocal.ok).toBe(false);
    expect(photoLocal.error).toMatch(/photoUrl/);
    const groupShort = await client.sendViaGateway(
      input({ kind: 'media_group', text: 'cap', media: [{ type: 'photo' }] }),
    );
    expect(groupShort.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('surfaces gateway errors and transport failures as ok:false', async () => {
    mockFetchOnce({ ok: false, message: 'chat not found' }, 400);
    const client = new GatewaySendClient();
    const denied = await client.sendViaGateway(input());
    expect(denied).toMatchObject({ ok: false, messageId: null });

    global.fetch = jest.fn().mockRejectedValue(
      new Error('socket hang up'),
    ) as unknown as typeof fetch;
    const down = await client.sendViaGateway(input());
    expect(down).toMatchObject({ ok: false, messageId: null });
    expect(down.error).toMatch(/socket hang up/);
  });
});
