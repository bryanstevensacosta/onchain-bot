import { GatewayHmacSigner } from './gateway-hmac-signer.service';

const ID = 'dexter-onchain-bot';
const SECRET = 'test-secret-1234567890';

describe('GatewayHmacSigner (dexter gateway todo 6)', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('signs and verifies the canonical string', () => {
    const ts = '1700000000';
    const nonce = 'abc123def456';
    const rawBody = JSON.stringify({ kind: 'message', chat_id: '1' });
    const sig = GatewayHmacSigner.sign(
      SECRET,
      'POST',
      '/api/bots/v/send',
      ts,
      nonce,
      rawBody,
    );
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(
      GatewayHmacSigner.verify(
        SECRET,
        sig,
        'POST',
        '/api/bots/v/send',
        ts,
        nonce,
        rawBody,
      ),
    ).toBe(true);
  });

  it('rejects tampered bodies and wrong secrets', () => {
    const ts = '1700000000';
    const nonce = 'abc123def456';
    const rawBody = JSON.stringify({ kind: 'message' });
    const sig = GatewayHmacSigner.sign(
      SECRET,
      'POST',
      '/api/bots/v/send',
      ts,
      nonce,
      rawBody,
    );
    expect(
      GatewayHmacSigner.verify(
        SECRET,
        sig,
        'POST',
        '/api/bots/v/send',
        ts,
        nonce,
        '{"kind":"photo"}',
      ),
    ).toBe(false);
    expect(
      GatewayHmacSigner.verify(
        'wrong-secret',
        sig,
        'POST',
        '/api/bots/v/send',
        ts,
        nonce,
        rawBody,
      ),
    ).toBe(false);
    expect(
      GatewayHmacSigner.verify(
        SECRET,
        'not-hex',
        'POST',
        '/api/bots/v/send',
        ts,
        nonce,
        rawBody,
      ),
    ).toBe(false);
  });

  it('emits x-api-key headers when the client env is set', () => {
    process.env.BOTS_GATEWAY_CLIENT_ID = ID;
    process.env.BOTS_GATEWAY_CLIENT_SECRET = SECRET;
    const signer = new GatewayHmacSigner();
    const headers = signer.authHeaders(
      'POST',
      '/api/bots/v/send',
      '{"kind":"message"}',
      { timestamp: '1700000000', nonce: 'fixednonce12345678' },
    );
    expect(headers['x-api-key']).toBe(ID);
    expect(headers['x-timestamp']).toBe('1700000000');
    expect(headers['x-nonce']).toBe('fixednonce12345678');
    expect(headers['x-signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns {} keyless (gateway guard fails open in dev)', () => {
    delete process.env.BOTS_GATEWAY_CLIENT_ID;
    delete process.env.BOTS_GATEWAY_CLIENT_SECRET;
    const signer = new GatewayHmacSigner();
    expect(signer.authHeaders('POST', '/api/bots/v/send', '{}')).toEqual({});
  });
});
