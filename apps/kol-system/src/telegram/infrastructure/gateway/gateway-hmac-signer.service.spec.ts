import { createHash, createHmac } from 'node:crypto';
import { GatewayHmacSigner } from './gateway-hmac-signer.service';

function configStub(env: {
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  publishMode?: 'direct' | 'dual' | 'gateway';
}) {
  return {
    get: (_key: string) => ({
      botToken: '',
      apiKey: '',
      botsGateway: {
        baseUrl: env.baseUrl ?? 'http://localhost:4070',
        clientId: env.clientId ?? '',
        clientSecret: env.clientSecret ?? '',
        publishMode: env.publishMode ?? 'dual',
      },
    }),
  } as never;
}

describe('GatewayHmacSigner (gateway todo 4, failing-first)', () => {
  it('signs the gateway canonical string (METHOD\\npath\\nts\\nnonce\\nsha256(rawBody))', () => {
    const secret = 'kol-system-test-secret';
    const rawBody = JSON.stringify({ kind: 'message', chat_id: '@c' });
    const expected = createHmac('sha256', secret)
      .update(
        [
          'POST',
          '/api/bots/bot-1/send',
          '1700000000',
          'nonce-12345678',
          createHash('sha256').update(rawBody).digest('hex'),
        ].join('\n'),
      )
      .digest('hex');
    expect(
      GatewayHmacSigner.sign(
        secret,
        'POST',
        '/api/bots/bot-1/send',
        '1700000000',
        'nonce-12345678',
        rawBody,
      ),
    ).toBe(expected);
  });

  it('emits x-api-key/x-timestamp/x-nonce/x-signature headers for a configured client', () => {
    const signer = new GatewayHmacSigner(
      configStub({ clientId: 'kol-system', clientSecret: 's3cret' }),
    );
    const headers = signer.authHeaders(
      'POST',
      '/api/bots/bot-1/send',
      JSON.stringify({ kind: 'message' }),
    );
    expect(headers['x-api-key']).toBe('kol-system');
    expect(headers['x-timestamp']).toMatch(/^\d+$/);
    expect(headers['x-nonce']!.length).toBeGreaterThanOrEqual(8);
    expect(headers['x-signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns no auth headers when keyless (gateway fails open in dev)', () => {
    const signer = new GatewayHmacSigner(configStub({}));
    expect(signer.authHeaders('POST', '/api/bots/bot-1/send', '{}')).toEqual(
      {},
    );
  });

  it('tampered bodies fail verification (sign-then-verify round-trip)', () => {
    const secret = 'kol-system-test-secret';
    const rawBody = JSON.stringify({ kind: 'message', chat_id: '@c' });
    const sig = GatewayHmacSigner.sign(
      secret,
      'POST',
      '/api/bots/bot-1/send',
      '1700000000',
      'nonce-12345678',
      rawBody,
    );
    expect(
      GatewayHmacSigner.verify(
        secret,
        sig,
        'POST',
        '/api/bots/bot-1/send',
        '1700000000',
        'nonce-12345678',
        rawBody,
      ),
    ).toBe(true);
    expect(
      GatewayHmacSigner.verify(
        secret,
        sig,
        'POST',
        '/api/bots/bot-1/send',
        '1700000000',
        'nonce-12345678',
        JSON.stringify({ kind: 'message', chat_id: '@evil' }),
      ),
    ).toBe(false);
  });
});
