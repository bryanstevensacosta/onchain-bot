import { hashApiKey, generateApiKey, keyPrefix, satisfiesScope } from './api-key-scope';

describe('api-key-scope (P46)', () => {
  it('hashes without ever embedding the plaintext', () => {
    const raw = 'md_test_secret_value_123';
    const hash = hashApiKey(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(raw);
  });

  it('generates keys with md_ prefix and 256-bit entropy', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).toMatch(/^md_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('derives a non-identifying prefix (no full key material)', () => {
    const raw = generateApiKey();
    const prefix = keyPrefix(raw);
    expect(raw.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(raw.length);
    expect(prefix.length).toBeLessThanOrEqual(11);
  });

  it('enforces scope hierarchy admin > snapshot > read', () => {
    expect(satisfiesScope(['read'], 'read')).toBe(true);
    expect(satisfiesScope(['read'], 'snapshot')).toBe(false);
    expect(satisfiesScope(['snapshot'], 'read')).toBe(true);
    expect(satisfiesScope(['snapshot'], 'snapshot')).toBe(true);
    expect(satisfiesScope(['snapshot'], 'admin')).toBe(false);
    expect(satisfiesScope(['admin'], 'read')).toBe(true);
    expect(satisfiesScope(['admin'], 'snapshot')).toBe(true);
    expect(satisfiesScope(['admin'], 'admin')).toBe(true);
  });
});
