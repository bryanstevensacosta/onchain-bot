import { ApiKeyService } from './api-key.service';

describe('ApiKeyService (P46)', () => {
  it('creates keys returning plaintext ONCE and storing only the hash', async () => {
    const svc = new ApiKeyService();
    const created = await svc.create({ name: 'kol-system', scopes: ['read'], rateLimitPerMin: 60 });
    expect(created.plaintext).toMatch(/^md_/);
    expect(created.record.keyHash).not.toContain(created.plaintext);
    expect(created.record.keyPrefix.length).toBeLessThan(created.plaintext.length);
    const listed = svc.list();
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(created.plaintext);
    expect('keyHash' in (listed[0] as Record<string, unknown>)).toBe(false);
  });

  it('verifies the key and rejects unknown keys', async () => {
    const svc = new ApiKeyService();
    const created = await svc.create({ name: 'a', scopes: ['snapshot'], rateLimitPerMin: 60 });
    expect(svc.verify(created.plaintext)?.name).toBe('a');
    expect(svc.verify('md_nonexistent_key_xxxxxxxxxxxxxxxxxxxx')).toBeNull();
  });

  it('rotation keeps the old key valid during grace (zero-downtime) then retires it', async () => {
    jest.useFakeTimers();
    try {
      const svc = new ApiKeyService();
      const created = await svc.create({ name: 'dex', scopes: ['snapshot'], rateLimitPerMin: 60 });
      const oldKey = created.plaintext;
      const rotated = await svc.rotate(created.record.id, 10 * 60 * 1000);
      expect(rotated.plaintext).not.toBe(oldKey);
      expect(svc.verify(oldKey)).not.toBeNull();
      expect(svc.verify(rotated.plaintext)).not.toBeNull();
      jest.advanceTimersByTime(10 * 60 * 1000 + 1);
      expect(svc.verify(oldKey)).toBeNull();
      expect(svc.verify(rotated.plaintext)).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('revoke kills the key immediately (compromise drill)', async () => {
    const svc = new ApiKeyService();
    const created = await svc.create({ name: 'leaked', scopes: ['read'], rateLimitPerMin: 60 });
    svc.revoke(created.record.id);
    expect(svc.verify(created.plaintext)).toBeNull();
  });
});
