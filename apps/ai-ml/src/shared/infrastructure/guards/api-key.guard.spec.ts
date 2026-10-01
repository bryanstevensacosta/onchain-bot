import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from 'auth/application/api-key.service';
import { AccessAuditService } from 'auth/application/access-audit.service';
import { ApiKeyRateLimiter } from 'auth/application/api-key-rate-limiter';

const contextFor = (
  headers: Record<string, string>,
  path = '/api/llm/models',
): never => {
  const handler = jest.fn();
  const klass = jest.fn();
  return {
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({
      getRequest: () => ({ headers, method: 'GET', path }),
    }),
  } as never;
};

const guardWith = (
  env: Record<string, string>,
  keys?: ApiKeyService,
): ApiKeyGuard =>
  new ApiKeyGuard(
    new Reflector(),
    new ConfigService(env),
    keys,
    new AccessAuditService(),
    new ApiKeyRateLimiter(),
  );

describe('ApiKeyGuard', () => {
  it('fail-opens keyless dev (no env key, empty store)', async () => {
    const guard = guardWith({});
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
  });

  it('rejects anonymous with 401 when auth is configured', async () => {
    const guard = guardWith({ AI_ML_API_KEY: 'secret' });
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts the legacy env key as admin-equivalent', async () => {
    const guard = guardWith({ AI_ML_API_KEY: 'secret' });
    await expect(
      guard.canActivate(contextFor({ 'x-api-key': 'secret' })),
    ).resolves.toBe(true);
  });

  it('verifies store keys and enforces scopes (403)', async () => {
    const keys = new ApiKeyService(
      new ConfigService({ ENCRYPTION_KEY: 'pepper' }),
    );
    const created = await keys.create({ name: 'reader', scopes: ['read'] });
    const guard = guardWith({}, keys);
    await expect(
      guard.canActivate(contextFor({ 'x-api-key': created.plaintext })),
    ).resolves.toBe(true);
    const adminCtx = {
      ...contextFor({ 'x-api-key': created.plaintext }, '/api/auth/keys'),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    };
    jest
      .spyOn(guard['reflector'], 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce('admin');
    await expect(guard.canActivate(adminCtx as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rate-limits over-budget keys (429 path)', async () => {
    const keys = new ApiKeyService(
      new ConfigService({ ENCRYPTION_KEY: 'pepper' }),
    );
    const created = await keys.create({
      name: 'tight',
      scopes: ['read'],
      rateLimitPerMin: 1,
    });
    const guard = guardWith({}, keys);
    await expect(
      guard.canActivate(contextFor({ 'x-api-key': created.plaintext })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor({ 'x-api-key': created.plaintext })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
