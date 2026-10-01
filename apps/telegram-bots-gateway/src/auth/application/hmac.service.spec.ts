import { createHash } from 'node:crypto';
import { HmacService } from './hmac.service';

const SECRET = 'test-client-secret-0123456789abcdef';

describe('HmacService (todo 2, red)', () => {
  let hmac: HmacService;

  beforeEach(() => {
    hmac = new HmacService();
  });

  it('signs and verifies a request round-trip', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = hmac.sign(
      SECRET,
      'POST',
      '/api/bots/abc/send',
      timestamp,
      'nonce-1',
      '{"text":"hi"}',
    );
    expect(
      hmac.verify(
        SECRET,
        sig,
        'POST',
        '/api/bots/abc/send',
        timestamp,
        'nonce-1',
        '{"text":"hi"}',
      ),
    ).toBe(true);
  });

  it('rejects a tampered body', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = hmac.sign(
      SECRET,
      'POST',
      '/api/bots/abc/send',
      timestamp,
      'nonce-2',
      '{"text":"hi"}',
    );
    expect(
      hmac.verify(
        SECRET,
        sig,
        'POST',
        '/api/bots/abc/send',
        timestamp,
        'nonce-2',
        '{"text":"evil"}',
      ),
    ).toBe(false);
  });

  it('rejects a wrong secret without throwing', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = hmac.sign(
      SECRET,
      'POST',
      '/api/bots/abc/send',
      timestamp,
      'nonce-3',
      '',
    );
    expect(
      hmac.verify(
        'wrong-secret',
        sig,
        'POST',
        '/api/bots/abc/send',
        timestamp,
        'nonce-3',
        '',
      ),
    ).toBe(false);
  });

  it('hashes an empty body deterministically (sha256 of empty string)', () => {
    expect(hmac.bodyHash(undefined)).toBe(
      createHash('sha256').update('', 'utf8').digest('hex'),
    );
    expect(hmac.bodyHash('')).toBe(hmac.bodyHash(undefined));
  });

  it('rejects malformed signatures without throwing', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(
      hmac.verify(
        SECRET,
        'not-hex!!!',
        'POST',
        '/api/bots/abc/send',
        timestamp,
        'nonce-4',
        '',
      ),
    ).toBe(false);
  });
});
