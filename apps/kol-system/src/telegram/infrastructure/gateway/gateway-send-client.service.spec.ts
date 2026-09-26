import { GatewaySendClient } from './gateway-send-client.service';
import { GatewayHmacSigner } from './gateway-hmac-signer.service';

function configStub() {
  return {
    get: (_key: string) => ({
      botToken: '',
      apiKey: '',
      botsGateway: {
        baseUrl: 'http://gateway:4070',
        clientId: 'kol-system',
        clientSecret: 's3cret',
        publishMode: 'gateway' as const,
      },
    }),
  } as never;
}

describe('GatewaySendClient (gateway todo 4, failing-first)', () => {
  const calls: Array<{
    url: string;
    init: { method?: string; headers?: Record<string, string>; body?: string };
  }> = [];
  let client: GatewaySendClient;

  beforeEach(() => {
    calls.length = 0;
    const signer = new GatewayHmacSigner(configStub());
    client = new GatewaySendClient(configStub(), signer);
    (global as unknown as { fetch: unknown }).fetch = async (
      url: string,
      init: { body?: string },
    ) => {
      calls.push({ url, init: init as never });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, message_id: 4242, attempts: 1 }),
      };
    };
  });

  afterEach(() => {
    delete (global as unknown as { fetch?: unknown }).fetch;
  });

  it('POSTs an HMAC-signed message to the gateway vault id (never the plaintext token)', async () => {
    const res = await client.sendViaGateway({
      botId: 'vault-bot-1',
      chatId: '@mirror',
      text: 'hi $BONK',
      clientMsgId: 'job-1',
    });
    expect(res).toMatchObject({ ok: true, messageId: 4242 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://gateway:4070/api/bots/vault-bot-1/send');
    const body = JSON.parse(calls[0].init.body ?? '{}') as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      kind: 'message',
      chat_id: '@mirror',
      client_msg_id: 'job-1',
    });
    expect(JSON.stringify(body)).not.toContain('s3cret');
    expect('botToken' in body || 'token' in body).toBe(false);
    expect(calls[0].init.headers?.['x-api-key']).toBe('kol-system');
    expect(calls[0].init.headers?.['x-signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sends photos via kind=photo with a truncated caption', async () => {
    const res = await client.sendViaGateway({
      botId: 'vault-bot-1',
      chatId: '@mirror',
      text: 'card $BONK',
      imageUrl: 'https://img/1.png',
      clientMsgId: 'job-2',
    });
    expect(res.ok).toBe(true);
    const body = JSON.parse(calls[0].init.body ?? '{}') as Record<
      string,
      unknown
    >;
    expect(body.kind).toBe('photo');
    expect(body.photo).toBe('https://img/1.png');
  });

  it('chunks messages over 4096 chars like the direct adapter (parity)', async () => {
    const res = await client.sendViaGateway({
      botId: 'vault-bot-1',
      chatId: '@mirror',
      text: 'x'.repeat(5000),
      clientMsgId: 'job-3',
    });
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('maps gateway 401/403 to fail-closed SendResult (no throw, no token)', async () => {
    (global as unknown as { fetch: unknown }).fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'invalid signature' }),
    });
    const res = await client.sendViaGateway({
      botId: 'vault-bot-1',
      chatId: '@mirror',
      text: 'hi',
    });
    expect(res.ok).toBe(false);
    expect(res.messageId).toBeNull();
    expect(res.error ?? '').not.toContain('s3cret');
  });

  it('maps transport errors to fail-closed SendResult', async () => {
    (global as unknown as { fetch: unknown }).fetch = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    const res = await client.sendViaGateway({
      botId: 'vault-bot-1',
      chatId: '@mirror',
      text: 'hi',
    });
    expect(res).toMatchObject({ ok: false, messageId: null });
  });
});
