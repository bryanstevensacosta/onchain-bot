import { DomainError } from '../../../shared/kernel/domain-error';
import { EncryptionService } from './encryption.service';

describe('EncryptionService AES-256-GCM (P22/P23, failing-first)', () => {
  const key = 'a'.repeat(64);
  const service = new EncryptionService({ get: () => undefined } as never);

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = key;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('round-trips a bot token (decrypt(encrypt(x)) === x)', () => {
    const token = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    const ciphertext = service.encrypt(token);
    expect(ciphertext).not.toContain(token);
    expect(service.decrypt(ciphertext)).toBe(token);
  });

  it('uses a random IV (same plaintext encrypts differently twice)', () => {
    expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
  });

  it('rejects empty plaintext and empty key (no plaintext token, no silent null)', () => {
    expect(() => service.encrypt('')).toThrow(DomainError);
    delete process.env.ENCRYPTION_KEY;
    expect(() => service.encrypt('x')).toThrow(DomainError);
  });

  it('fails closed on tampered payloads and wrong keys', () => {
    const ciphertext = service.encrypt('secret');
    expect(() => service.decrypt(ciphertext.slice(0, -2) + 'ff')).toThrow();
    process.env.ENCRYPTION_KEY = 'b'.repeat(64);
    expect(() => service.decrypt(ciphertext)).toThrow();
  });
});
