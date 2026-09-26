import { ApiKeyRateLimiter } from './api-key-rate-limiter';
import { AccessAuditService } from './access-audit.service';

describe('ApiKeyRateLimiter', () => {
  it('allows within budget and rejects over budget (429 path)', () => {
    const limiter = new ApiKeyRateLimiter(60, 60_000);
    expect(limiter.consume('k', 2, 1000)).toBe(true);
    expect(limiter.consume('k', 2, 1001)).toBe(true);
    expect(limiter.consume('k', 2, 1002)).toBe(false);
    expect(limiter.consume('k', 2, 61_001)).toBe(true);
  });

  it('isolates budgets per key', () => {
    const limiter = new ApiKeyRateLimiter(60, 60_000);
    expect(limiter.consume('a', 1, 1000)).toBe(true);
    expect(limiter.consume('a', 1, 1001)).toBe(false);
    expect(limiter.consume('b', 1, 1001)).toBe(true);
  });
});

describe('AccessAuditService', () => {
  it('records decisions and drops oldest past capacity', () => {
    const audit = new AccessAuditService(2);
    audit.record({ keyId: 'k1', method: 'GET', path: '/api/llm/models', status: 200 });
    audit.record({ keyId: 'anon', method: 'POST', path: '/api/llm/generate', status: 401 });
    audit.record({ keyId: 'k1', method: 'POST', path: '/api/llm/generate', status: 200 });
    expect(audit.size()).toBe(2);
    expect(audit.list()[0].status).toBe(401);
  });
});
