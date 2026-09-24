import { ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard, API_KEY_HEADER } from './api-key.guard';

function contextWithHeaders(
  headers: Record<string, unknown>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  it('allows a matching x-api-key', () => {
    const guard = new ApiKeyGuard('secret');
    expect(
      guard.canActivate(contextWithHeaders({ [API_KEY_HEADER]: 'secret' })),
    ).toBe(true);
  });

  it('denies a wrong or missing key', () => {
    const guard = new ApiKeyGuard('secret');
    expect(
      guard.canActivate(contextWithHeaders({ [API_KEY_HEADER]: 'nope' })),
    ).toBe(false);
    expect(guard.canActivate(contextWithHeaders({}))).toBe(false);
  });

  it('fails open when no expected key is configured (keyless dev)', () => {
    const guard = new ApiKeyGuard('');
    expect(guard.canActivate(contextWithHeaders({}))).toBe(true);
  });
});
