import { GatewayHmacSigner } from './gateway-hmac-signer.service';

describe('GatewayHmacSigner', () => {
  it('produces the canonical METHOD\\npath\\nts\\nonce\\nsha256(body) signature', () => {
    const sig = GatewayHmacSigner.sign(
      'secret',
      'POST',
      '/api/bots/b1/send',
      '1720000000',
      'nonce1',
      '{"kind":"message"}',
    );
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(
      GatewayHmacSigner.verify(
        'secret',
        sig,
        'POST',
        '/api/bots/b1/send',
        '1720000000',
        'nonce1',
        '{"kind":"message"}',
      ),
    ).toBe(true);
  });

  it('rejects wrong secrets, tampered bodies and malformed signatures', () => {
    const sig = GatewayHmacSigner.sign(
      'secret',
      'POST',
      '/api/bots/b1/send',
      '1720000000',
      'nonce1',
      '{"kind":"message"}',
    );
    expect(
      GatewayHmacSigner.verify(
        'wrong',
        sig,
        'POST',
        '/api/bots/b1/send',
        '1720000000',
        'nonce1',
        '{"kind":"message"}',
      ),
    ).toBe(false);
    expect(
      GatewayHmacSigner.verify(
        'secret',
        sig,
        'POST',
        '/api/bots/b1/send',
        '1720000000',
        'nonce1',
        '{"kind":"tampered"}',
      ),
    ).toBe(false);
    expect(
      GatewayHmacSigner.verify(
        'secret',
        'not-hex',
        'POST',
        '/api/bots/b1/send',
        '1720000000',
        'nonce1',
        '{"kind":"message"}',
      ),
    ).toBe(false);
  });

  it('returns empty headers in keyless dev (no client id or secret)', () => {
    const signer = new GatewayHmacSigner();
    expect(signer.authHeaders('POST', '/api/bots/b1/send', '{}')).toEqual({});
  });
});
