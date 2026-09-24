import { ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard';

const TEST_KEY = 'test-secret-key-12345';

function mockConfigService(apiKey: string | undefined): ConfigService {
  return {
    get: (key: string): string | undefined => {
      if (key === 'app.apiKey') {
        return apiKey;
      }
      return undefined;
    },
  } as ConfigService;
}

function makeContext(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  query: Record<string, string> = {},
): ExecutionContext {
  const req = { method, path, headers, query };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('unset key (dev/e2e convenience)', () => {
    it('allows protected routes keyless and warns once', () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const guard = new ApiKeyGuard(mockConfigService(undefined));

      expect(
        guard.canActivate(makeContext('GET', '/api/ingestion/stream')),
      ).toBe(true);
      expect(guard.canActivate(makeContext('GET', '/metrics'))).toBe(true);
      expect(guard.canActivate(makeContext('GET', '/debug/telegram/x'))).toBe(
        true,
      );

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('treats blank key as unset', () => {
      const guard = new ApiKeyGuard(mockConfigService('   '));
      expect(guard.canActivate(makeContext('GET', '/metrics'))).toBe(true);
    });
  });

  describe('public allowlist (key set)', () => {
    const cases: Array<[string, string]> = [
      ['GET', '/api/feed/messages?limit=50'],
      ['GET', '/api/feed/sources'],
      ['GET', '/api/feed/sources/active/ids'],
      ['GET', '/api/feed/stats'],
      ['GET', '/api/media/-1001/2/0'],
      ['GET', '/api/health'],
      ['GET', '/api/health/live'],
      ['GET', '/api/health/ready'],
    ];

    it.each(cases)('passes keyless: %s %s', (method, path) => {
      const guard = new ApiKeyGuard(mockConfigService(TEST_KEY));
      expect(guard.canActivate(makeContext(method, path))).toBe(true);
    });
  });

  describe('protected routes (key set)', () => {
    it('401s without key', () => {
      const guard = new ApiKeyGuard(mockConfigService(TEST_KEY));
      expect(() =>
        guard.canActivate(makeContext('GET', '/api/ingestion/stream')),
      ).toThrow('Invalid or missing API key');
      expect(() => guard.canActivate(makeContext('GET', '/metrics'))).toThrow(
        'Invalid or missing API key',
      );
      expect(() =>
        guard.canActivate(makeContext('GET', '/debug/telegram/c/m')),
      ).toThrow('Invalid or missing API key');
      expect(() =>
        guard.canActivate(makeContext('GET', '/api/health/channels')),
      ).toThrow('Invalid or missing API key');
    });

    it('401s on write to /api/feed without key', () => {
      const guard = new ApiKeyGuard(mockConfigService(TEST_KEY));
      expect(() =>
        guard.canActivate(makeContext('POST', '/api/feed/sources')),
      ).toThrow('Invalid or missing API key');
    });

    it('401s on wrong key', () => {
      const guard = new ApiKeyGuard(mockConfigService(TEST_KEY));
      expect(() =>
        guard.canActivate(
          makeContext('GET', '/metrics', { 'x-api-key': 'wrong-key' }),
        ),
      ).toThrow('Invalid or missing API key');
      expect(() =>
        guard.canActivate(
          makeContext('GET', '/metrics', {}, { apiKey: 'wrong-key' }),
        ),
      ).toThrow('Invalid or missing API key');
    });

    it('200s with correct key via header', () => {
      const guard = new ApiKeyGuard(mockConfigService(TEST_KEY));
      expect(
        guard.canActivate(
          makeContext('GET', '/api/ingestion/stream', {
            'x-api-key': TEST_KEY,
          }),
        ),
      ).toBe(true);
      expect(
        guard.canActivate(
          makeContext('GET', '/metrics', { 'x-api-key': TEST_KEY }),
        ),
      ).toBe(true);
    });

    it('200s with correct key via query', () => {
      const guard = new ApiKeyGuard(mockConfigService(TEST_KEY));
      expect(
        guard.canActivate(
          makeContext('GET', '/metrics', {}, { apiKey: TEST_KEY }),
        ),
      ).toBe(true);
      expect(
        guard.canActivate(
          makeContext('GET', '/debug/telegram/c/m', {}, { apiKey: TEST_KEY }),
        ),
      ).toBe(true);
    });
  });
});
