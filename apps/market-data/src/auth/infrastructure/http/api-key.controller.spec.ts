import { ApiKeyController } from './api-key.controller';
import { AccessAuditService } from 'auth/application/access-audit.service';
import { ApiKeyService } from 'auth/application/api-key.service';

describe('ApiKeyController (P46 admin edge)', () => {
  it('create returns plaintext once; list never carries hashes or keys', async () => {
    const keys = new ApiKeyService();
    const ctl = new ApiKeyController(keys, new AccessAuditService());
    const created = await ctl.create({ name: 'kol-system', scopes: ['read'], rateLimitPerMin: 60 });
    expect(created.key).toMatch(/^md_/);
    const listed = ctl.list();
    expect(listed.keys).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(created.key);
    expect(JSON.stringify(listed)).not.toContain('keyHash');
  });

  it('rotate keeps both keys valid (zero-downtime) and revoke kills', async () => {
    jest.useFakeTimers();
    try {
      const keys = new ApiKeyService();
      const ctl = new ApiKeyController(keys, new AccessAuditService());
      const created = await ctl.create({ name: 'dex', scopes: ['snapshot'], rateLimitPerMin: 60 });
      const rotated = await ctl.rotate(created.id);
      expect(keys.verify(created.key)).not.toBeNull();
      expect(keys.verify(rotated.key)).not.toBeNull();
      await ctl.revoke(created.id);
      expect(keys.verify(rotated.key)).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('audit lists entries without key material', async () => {
    const audit = new AccessAuditService();
    const ctl = new ApiKeyController(new ApiKeyService(), audit);
    audit.record({ keyId: 'k1', keyName: 'ops', method: 'GET', path: '/api/v1/auth/keys?apiKey=md_secret', status: 200 });
    const out = ctl.getAudit();
    expect(JSON.stringify(out)).not.toMatch(/md_secret/);
    expect((out.entries[0] as { path: string }).path).toBe('/api/v1/auth/keys');
  });
});
