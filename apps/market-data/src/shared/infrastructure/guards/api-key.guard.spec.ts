import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';

function contextWith(headers: Record<string, unknown>): any {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  };
}

describe('ApiKeyGuard', () => {
  const reflector = new Reflector();
  const guard = new ApiKeyGuard(reflector);

  afterEach(() => {
    delete process.env.MARKET_DATA_API_KEY;
  });

  it('fails open when no key is configured (keyless dev)', () => {
    delete process.env.MARKET_DATA_API_KEY;
    expect(guard.canActivate(contextWith({}))).toBe(true);
  });

  it('requires the exact key when configured', () => {
    process.env.MARKET_DATA_API_KEY = 'secret';
    expect(guard.canActivate(contextWith({ 'x-api-key': 'secret' }))).toBe(
      true,
    );
    expect(guard.canActivate(contextWith({ 'x-api-key': 'wrong' }))).toBe(
      false,
    );
    expect(guard.canActivate(contextWith({}))).toBe(false);
  });
});
