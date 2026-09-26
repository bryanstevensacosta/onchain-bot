import { ConfigService } from '@nestjs/config';
import { ApiKeyService, MISSING_ENCRYPTION_KEY_MESSAGE } from './api-key.service';

const withPepper = (): ApiKeyService =>
  new ApiKeyService(new ConfigService({ ENCRYPTION_KEY: 'test-pepper' }));

describe('ApiKeyService', () => {
  it('fails LOUD without ENCRYPTION_KEY (adversarial: no silent keyless store)', async () => {
    const broken = new ApiKeyService(new ConfigService({}));
    await expect(broken.create({ name: 'k', scopes: ['read'] })).rejects.toThrow(
      MISSING_ENCRYPTION_KEY_MESSAGE,
    );
    await expect(broken.verify('aiml_anything')).rejects.toThrow(
      MISSING_ENCRYPTION_KEY_MESSAGE,
    );
  });

  it('creates (plaintext once) + verifies + revokes', async () => {
    const svc = withPepper();
    const created = await svc.create({ name: 'feed', scopes: ['generate'] });
    expect(created.plaintext.startsWith('aiml_')).toBe(true);
    const record = await svc.verify(created.plaintext);
    expect(record?.name).toBe('feed');
    expect(await svc.revoke(created.record.id)).toBe(true);
    await expect(svc.verify(created.plaintext)).resolves.toBeNull();
  });

  it('never leaks plaintext in list views', async () => {
    const svc = withPepper();
    const created = await svc.create({ name: 'ops', scopes: ['admin'] });
    const list = await svc.list();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list[0])).not.toContain(created.plaintext);
    expect(list[0].keyPrefix).toBe(created.plaintext.slice(0, 11));
  });

  it('rejects bad input', async () => {
    const svc = withPepper();
    await expect(svc.create({ name: '', scopes: ['read'] })).rejects.toThrow(
      'Key name is required',
    );
    await expect(svc.create({ name: 'x', scopes: [] })).rejects.toThrow(
      'At least one valid scope',
    );
  });

  it('rejects unknown keys', async () => {
    const svc = withPepper();
    await expect(svc.verify('aiml_unknown')).resolves.toBeNull();
  });
});
