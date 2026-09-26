import { GatewaySendClient } from './gateway-send-client.service';
import { GatewayHmacSigner } from './gateway-hmac-signer.service';

function mockFetchOnce(payload: unknown, ok = true, status = 200): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function makeClient() {
  const botConfig = {
    get: () => ({
      botsGatewayBaseUrl: 'http://gateway:4070',
    }),
  };
  const signer = new GatewayHmacSigner();
  return new GatewaySendClient(botConfig as never, signer as never);
}

describe('GatewaySendClient (dexter gateway todo 6)', () => {
  const OLD_ENV = { ...process.env };
  const OLD_FETCH = global.fetch;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = OLD_ENV;
    global.fetch = OLD_FETCH;
  });

  it('posts a message leg and returns the gateway message_id', async () => {
    const fetchMock = mockFetchOnce({ ok: true, message_id: 777 });
    const client = makeClient();
    const out = await client.sendViaGateway({
      botId: 'vault-1',
      chatId: '42',
      text: 'SCAN $SOL',
      clientMsgId: 'dexter-1',
    });
    expect(out).toEqual({ ok: true, messageId: 777, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://gateway:4070/api/bots/vault-1/send');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      kind: 'message',
      chat_id: '42',
      client_msg_id: 'dexter-1',
    });
    expect(body).not.toHaveProperty('token');
    expect(url).not.toContain('TOK');
  });

  it('chunks long texts with per-chunk idempotency keys', async () => {
    const fetchMock = mockFetchOnce({ ok: true, message_id: 1 });
    const client = makeClient();
    const out = await client.sendViaGateway({
      botId: 'vault-1',
      chatId: '42',
      text: 'a'.repeat(5000),
      clientMsgId: 'dexter-2',
    });
    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as Record<string, unknown>;
    const second = JSON.parse(
      String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body),
    ) as Record<string, unknown>;
    expect(first.client_msg_id).toBe('dexter-2:chunk:0');
    expect(second.client_msg_id).toBe('dexter-2:chunk:1');
  });

  it('fails closed on empty text', async () => {
    const fetchMock = mockFetchOnce({ ok: true, message_id: 1 });
    const client = makeClient();
    const out = await client.sendViaGateway({
      botId: 'vault-1',
      chatId: '42',
      text: '',
    });
    expect(out.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on keyboard shapes (no gateway reply_markup)', async () => {
    const fetchMock = mockFetchOnce({ ok: true, message_id: 1 });
    const client = makeClient();
    const out = await client.sendViaGateway({
      botId: 'vault-1',
      chatId: '42',
      text: 'CARD',
      replyMarkup: { inline_keyboard: [] },
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/reply_markup/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on gateway 401 without throwing', async () => {
    mockFetchOnce({ ok: false, message: 'Unauthorized' }, false, 401);
    const client = makeClient();
    const out = await client.sendViaGateway({
      botId: 'vault-1',
      chatId: '42',
      text: 'SCAN',
    });
    expect(out).toEqual({ ok: false, messageId: null, error: 'Unauthorized' });
  });
});
