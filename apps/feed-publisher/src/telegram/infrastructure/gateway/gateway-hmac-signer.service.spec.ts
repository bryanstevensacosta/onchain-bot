import { GatewayHmacSigner } from './gateway-hmac-signer.service';

function makeSigner(env: Record<string, string> = {}): GatewayHmacSigner {
  const config = {
    get: (key: string, fallback = ''): string => env[key] ?? fallback,
  } as unknown as import('@nestjs/config').ConfigService;
  return new GatewayHmacSigner(config);
}

describe('GatewayHmacSigner', () => {
  it('returns empty headers in keyless dev (no client id/secret)', () => {
    const signer = makeSigner({});
    expect(signer.authHeaders('POST', '/api/bots/x/send', '{}')).toEqual({});
  });

  it('signs the gateway canonical string and verifies timing-safe', () => {
    const secret = 's3cret';
    const rawBody = '{"kind":"message","chat_id":"@c","text":"hi"}';
    const sig = GatewayHmacSigner.sign(
      secret,
      'POST',
      '/api/bots/x/send',
      '1700000000',
      'nonce1234',
      rawBody,
    );
    expect(
      GatewayHmacSigner.verify(
        secret,
        sig,
        'POST',
        '/api/bots/x/send',
        '1700000000',
        'nonce1234',
        rawBody,
      ),
    ).toBe(true);
  });

  it('rejects tampered bodies and wrong secrets', () => {
    const secret = 's3cret';
    const rawBody = '{"kind":"message"}';
    const sig = GatewayHmacSigner.sign(
      secret,
      'POST',
      '/api/bots/x/send',
      '1700000000',
      'nonce1234',
      rawBody,
    );
    expect(
      GatewayHmacSigner.verify(
        secret,
        sig,
        'POST',
        '/api/bots/x/send',
        '1700000000',
        'nonce1234',
        '{"kind":"photo"}',
      ),
    ).toBe(false);
    expect(
      GatewayHmacSigner.verify(
        'other',
        sig,
        'POST',
        '/api/bots/x/send',
        '1700000000',
        'nonce1234',
        rawBody,
      ),
    ).toBe(false);
  });

  it('emits x-api-key + x-timestamp + x-nonce + x-signature when keyed', () => {
    const keyed = new GatewayHmacSigner({
      get: (path: string): unknown =>
        path === 'telegram'
          ? {
              botsGateway: {
                clientId: 'feed-publisher',
                clientSecret: 'shh',
              },
            }
          : undefined,
    } as unknown as import('@nestjs/config').ConfigService);
    const headers = keyed.authHeaders('POST', '/api/bots/x/send', '{}', {
      timestamp: '1700000000',
      nonce: 'fixed-nonce-1',
    });
    expect(headers['x-api-key']).toBe('feed-publisher');
    expect(headers['x-timestamp']).toBe('1700000000');
    expect(headers['x-nonce']).toBe('fixed-nonce-1');
    expect(typeof headers['x-signature']).toBe('string');
    expect((headers['x-signature'] as string).length).toBe(64);
  });
});
