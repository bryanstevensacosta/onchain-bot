import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

function configWith(key: string | undefined): ConfigService {
  return {
    get: (path: string) => (path === 'app.encryptionKey' ? key : undefined),
  } as unknown as ConfigService;
}

describe('EncryptionService (AES-256-GCM)', () => {
  const KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('round-trips a bot token', () => {
    const svc = new EncryptionService(configWith(KEY));
    const cipher = svc.encrypt('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');
    expect(cipher).not.toContain('123456:ABC');
    expect(cipher.split(':')).toHaveLength(3);
    expect(svc.decrypt(cipher)).toBe(
      '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    );
  });

  it('produces distinct ciphertexts for the same plaintext (random IV)', () => {
    const svc = new EncryptionService(configWith(KEY));
    expect(svc.encrypt('tok')).not.toBe(svc.encrypt('tok'));
  });

  it('rejects tampered payloads (auth tag mismatch)', () => {
    const svc = new EncryptionService(configWith(KEY));
    const [iv, _tag, data] = svc.encrypt('tok').split(':');
    expect(() =>
      svc.decrypt(`${iv}:deadbeefdeadbeefdeadbeefdeadbeef:${data}`),
    ).toThrow('failed to decrypt payload');
  });

  it('fail-closes when ENCRYPTION_KEY is empty', () => {
    const svc = new EncryptionService(configWith('  '));
    expect(() => svc.encrypt('tok')).toThrow(
      'ENCRYPTION_KEY is required but empty',
    );
  });

  it('accepts non-hex dev keys via SHA-256 hashing', () => {
    const svc = new EncryptionService(configWith('dev-only-passphrase'));
    expect(svc.decrypt(svc.encrypt('tok'))).toBe('tok');
  });
});
