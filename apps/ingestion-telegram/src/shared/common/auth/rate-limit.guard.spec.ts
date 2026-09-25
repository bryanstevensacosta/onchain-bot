import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RateLimitGuard,
  getRateLimitBucket,
  resolveClientIp,
} from './rate-limit.guard';

const TEST_KEY = 'test-secret-key-12345';

function mockConfigService(
  apiKey: string | undefined,
  trustProxy = false,
): ConfigService {
  return {
    get: (key: string): string | boolean | undefined => {
      if (key === 'app.apiKey') {
        return apiKey;
      }
      if (key === 'app.trustProxy') {
        return trustProxy;
      }
      return undefined;
    },
  } as ConfigService;
}

function makeContext(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  ip = '10.0.0.1',
): ExecutionContext {
  const req = { method, path, headers, ip, query: {} };
  const res = {
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string): void {
      this.headers[name] = value;
    },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard (sec1 red-first)', () => {
  describe('bucket classification', () => {
    it('classifies protected routes into bucket A', () => {
      expect(getRateLimitBucket('GET', '/api/feed/sources')).toBe('A');
      expect(getRateLimitBucket('GET', '/api/crypto-news/messages')).toBe('A');
      expect(getRateLimitBucket('GET', '/metrics')).toBe('A');
      expect(getRateLimitBucket('POST', '/api/feed/sources')).toBe('A');
    });

    it('classifies public reads into bucket B', () => {
      expect(getRateLimitBucket('GET', '/api/media/-1/2/0')).toBe('B');
      expect(getRateLimitBucket('GET', '/api/kol-avatar/-1001')).toBe('B');
    });

    it('exempts health trio + SSE handshake from counting', () => {
      expect(getRateLimitBucket('GET', '/api/health')).toBe('exempt');
      expect(getRateLimitBucket('GET', '/api/health/ready')).toBe('exempt');
      expect(getRateLimitBucket('GET', '/api/health/live')).toBe('exempt');
      expect(getRateLimitBucket('GET', '/api/ingestion/stream')).toBe('exempt');
    });
  });

  describe('401 precedes 429 (M1)', () => {
    it('returns true (defers to ApiKeyGuard 401) when key set but missing', () => {
      const guard = new RateLimitGuard(mockConfigService(TEST_KEY));
      for (let i = 0; i < 200; i++) {
        expect(guard.canActivate(makeContext('GET', '/api/feed/sources'))).toBe(
          true,
        );
      }
    });
  });

  describe('429 on over-budget protected traffic (with key)', () => {
    it('429s the 61st protected request with Retry-After', () => {
      const guard = new RateLimitGuard(mockConfigService(TEST_KEY));
      const headers = { 'x-api-key': TEST_KEY };
      for (let i = 0; i < 60; i++) {
        expect(guard.canActivate(makeContext('GET', '/metrics', headers))).toBe(
          true,
        );
      }
      expect(() =>
        guard.canActivate(makeContext('GET', '/metrics', headers)),
      ).toThrow(expect.objectContaining({ status: 429 }));
    });

    it('never 429s the SSE handshake burst with key (10 rapid)', () => {
      const guard = new RateLimitGuard(mockConfigService(TEST_KEY));
      const headers = { 'x-api-key': TEST_KEY };
      for (let i = 0; i < 10; i++) {
        expect(
          guard.canActivate(
            makeContext('GET', '/api/ingestion/stream', headers),
          ),
        ).toBe(true);
      }
    });

    it('never 429s the health trio (100 rapid hits)', () => {
      const guard = new RateLimitGuard(mockConfigService(TEST_KEY));
      for (let i = 0; i < 100; i++) {
        expect(guard.canActivate(makeContext('GET', '/api/health'))).toBe(true);
      }
    });
  });

  describe('unset-key mode (M4)', () => {
    it('never 429s when no key is configured', () => {
      const guard = new RateLimitGuard(mockConfigService(undefined));
      for (let i = 0; i < 200; i++) {
        expect(guard.canActivate(makeContext('GET', '/api/feed/sources'))).toBe(
          true,
        );
      }
    });
  });

  describe('trust-proxy IP keying (M2)', () => {
    it('ignores x-forwarded-for when trustProxy is off', () => {
      expect(
        resolveClientIp(
          {
            ip: '10.0.0.1',
            headers: { 'x-forwarded-for': '9.9.9.9' },
          },
          false,
        ),
      ).toBe('10.0.0.1');
    });

    it('honors x-forwarded-for-first when trustProxy is on', () => {
      expect(
        resolveClientIp(
          {
            ip: '10.0.0.1',
            headers: { 'x-forwarded-for': '9.9.9.9, 8.8.8.8' },
          },
          true,
        ),
      ).toBe('9.9.9.9');
    });
  });
});
