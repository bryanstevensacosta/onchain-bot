import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const reflector = new Reflector();
  const guard = new ApiKeyGuard(reflector);

  function context(
    headers: Record<string, unknown>,
    isPublic = false,
  ): ExecutionContext {
    return {
      getHandler: (): unknown => (isPublic ? 'public' : 'guarded'),
      getClass: (): unknown => ({}),
      switchToHttp: (): unknown => ({ getRequest: () => ({ headers }) }),
    } as ExecutionContext;
  }

  beforeEach(() => {
    delete process.env.SCHEDULING_POSTS_API_KEY;
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: string, targets: unknown[]) =>
        targets[0] === 'public' ? true : undefined,
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.SCHEDULING_POSTS_API_KEY;
  });

  it('passes @Public() routes without a key', () => {
    process.env.SCHEDULING_POSTS_API_KEY = 'secret';
    expect(guard.canActivate(context({}, true))).toBe(true);
  });

  it('fails open when no key is configured', () => {
    expect(guard.canActivate(context({}))).toBe(true);
  });

  it('checks the exact key when configured (401 on mismatch)', () => {
    process.env.SCHEDULING_POSTS_API_KEY = 'secret';
    expect(guard.canActivate(context({ 'x-api-key': 'secret' }))).toBe(true);
    expect(() => guard.canActivate(context({ 'x-api-key': 'wrong' }))).toThrow(
      expect.objectContaining({ status: 401 }),
    );
    expect(() => guard.canActivate(context({}))).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });
});
