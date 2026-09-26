import { GatewaySendClient } from './gateway-send-client.service';
import { GatewayHmacSigner } from './gateway-hmac-signer.service';
import type { ConfigService } from '@nestjs/config';

function makeConfig(env: Record<string, string> = {}): ConfigService {
  return {
    get: (path: string, fallback = ''): unknown => {
      if (path === 'telegram') {
        return {
          botsGateway: {
            baseUrl: env.BOTS_GATEWAY_URL ?? 'http://localhost:4070',
            clientId: env.BOTS_GATEWAY_CLIENT_ID ?? '',
            clientSecret: env.BOTS_GATEWAY_CLIENT_SECRET ?? '',
          },
        };
      }
      return env[path] ?? fallback;
    },
  } as unknown as ConfigService;
}

describe('GatewaySendClient', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis as { fetch?: unknown }).fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('returns empty-message without touching the network', async () => {
    const spy = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = spy;
    const client = new GatewaySendClient(makeConfig(), new GatewayHmacSigner());
    const out = await client.sendViaGateway({
      botId: 'vault-1',
      chatId: '@c',
      kind: 'message',
      text: '',
    });
    expect(out).toMatchObject({ ok: false, error: 'empty message' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('posts one message chunk with client_msg_id + HMAC headers', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, message_id: 777 }),
    });
    const config = makeConfig({
      BOTS_GATEWAY_CLIENT_ID: 'feed-publisher',
      BOTS_GATEWAY_CLIENT_SECRET: 'shh',
    });
    const client = new GatewaySendClient(
      config,
      new GatewayHmacSigner(config),
    );
    const out = await client.sendViaGateway({
      botId: 'vault-1',
      chatId: '@c',
      kind: 'message',
      text: 'hello feed',
      clientMsgId: 'job-1',
    });
    expect(out).toMatchObject({ ok: true, messageId: 777 });
    const fetchMock = globalThis.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4070/api/bots/vault-1/send');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      kind: 'message',
      chat_id: '@c',
      text: 'hello feed',
      client_msg_id: 'job-1',
    });
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('feed-publisher');
    expect(typeof headers['x-signature']).toBe('string');
  });

  it('splits 4096+ texts into per-chunk idempotent posts', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, message_id: 1 }),
    });
    const client = new GatewaySendClient(makeConfig(), new GatewayHmacSigner());
    const out = await client.sendViaGateway({
      botId: 'vault-1',
      chatId: '@c',
      kind: 'message',
      text: 'x'.repeat(5000),
      clientMsgId: 'job-2',
    });
    expect(out.ok).toBe(true);
    const fetchMock = globalThis.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    expect(second['client_msg_id']).toBe('job-2:chunk:1');
  });

  it('fail-closes transport errors without throwing', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('down'));
    const client = new GatewaySendClient(makeConfig(), new GatewayHmacSigner());
    const out = await client.sendViaGateway({
      botId: 'vault-1',
      chatId: '@c',
      kind: 'message',
      text: 'hi',
    });
    expect(out).toMatchObject({ ok: false, messageId: null });
    expect(out.error).toContain('down');
  });
});
