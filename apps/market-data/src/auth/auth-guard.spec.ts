import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from 'shared/infrastructure/guards/api-key.guard';
import { ApiKeyService } from './application/api-key.service';
import { AccessAuditService } from './application/access-audit.service';
import { REQUIRED_SCOPE_KEY } from './application/require-scope.decorator';
import type { ApiKeyScope } from './domain/api-key-scope';

function ctx(method: string, path: string, headers: Record<string, unknown> = {}, scope: ApiKeyScope = 'read'): any {
  const handler = (): void => undefined;
  Reflect.defineMetadata(REQUIRED_SCOPE_KEY, scope, handler);
  const cls = class {};
  return {
    getHandler: (): unknown => handler,
    getClass: (): unknown => cls,
    switchToHttp: (): unknown => ({
      getRequest: (): unknown => ({ method, path, url: path, headers }),
      getResponse: (): unknown => ({ statusCode: 200 }),
    }),
  };
}

describe('ApiKeyGuard scopes + rate-limit (P46)', () => {
  it('rejects missing key with 401', async () => {
    const keys = new ApiKeyService();
    await keys.create({ name: 'seed', scopes: ['read'], rateLimitPerMin: 60 });
    const guard = new ApiKeyGuard(new Reflector(), keys, new AccessAuditService());
    const context = ctx('GET', '/api/v1/chains', {});
    expect(() => guard.canActivate(context as never)).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });

  it('rejects read key on snapshot route with 403', async () => {
    const keys = new ApiKeyService();
    const created = await keys.create({ name: 'reader', scopes: ['read'], rateLimitPerMin: 60 });
    const guard = new ApiKeyGuard(new Reflector(), keys, new AccessAuditService());
    const context = ctx('POST', '/api/v1/addresses/batch', { 'x-api-key': created.plaintext }, 'snapshot');
    expect(() => guard.canActivate(context as never)).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('rate-limits per key with 429', async () => {
    const keys = new ApiKeyService();
    const created = await keys.create({ name: 'tight', scopes: ['snapshot'], rateLimitPerMin: 2 });
    const guard = new ApiKeyGuard(new Reflector(), keys, new AccessAuditService());
    const mk = (): any => ctx('POST', '/api/v1/addresses/batch', { 'x-api-key': created.plaintext }, 'snapshot');
    expect(guard.canActivate(mk() as never)).toBe(true);
    expect(guard.canActivate(mk() as never)).toBe(true);
    expect(() => guard.canActivate(mk() as never)).toThrow(
      expect.objectContaining({ status: 429 }),
    );
  });
});
