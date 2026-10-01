import { Logger } from '@nestjs/common';
import { StructuredLoggerService } from '../logging/structured-logger.service';
import { stripQueryForAudit } from './access-audit';

const TEST_KEY = 'sec1-redaction-probe-key-zz9';

describe('access audit redaction (sec1 red-first)', () => {
  let service: StructuredLoggerService;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new StructuredLoggerService();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('strips the query string (never logs ?apiKey=)', () => {
    expect(
      stripQueryForAudit(`/api/feed/sources?apiKey=${TEST_KEY}&limit=50`),
    ).toBe('/api/feed/sources');
  });

  it('allow decision carries no key material', () => {
    service.logAccessDecision({
      method: 'GET',
      path: '/metrics',
      decision: 'allow',
      guard: 'api-key-guard',
      clientIp: '10.0.0.1',
    });
    const lines = logSpy.mock.calls.map((c) => JSON.stringify(c[0])).join('\n');
    expect(lines).toContain('auth:access:decision');
    expect(lines).not.toMatch(/apiKey/i);
    expect(lines).not.toContain(TEST_KEY);
  });

  it('deny decision carries no key material', () => {
    service.logAccessDecision({
      method: 'GET',
      path: '/metrics',
      decision: 'deny',
      guard: 'api-key-guard',
      clientIp: '10.0.0.1',
    });
    const lines = logSpy.mock.calls.map((c) => JSON.stringify(c[0])).join('\n');
    expect(lines).toContain('auth:access:decision');
    expect(lines).not.toMatch(/apiKey/i);
    expect(lines).not.toContain(TEST_KEY);
  });

  it('legacy query transport is logged with the path stripped', () => {
    service.logAccessDecision({
      method: 'GET',
      path: stripQueryForAudit(`/metrics?apiKey=${TEST_KEY}`),
      decision: 'allow',
      guard: 'api-key-guard',
      clientIp: '10.0.0.1',
    });
    const lines = logSpy.mock.calls.map((c) => JSON.stringify(c[0])).join('\n');
    expect(lines).not.toMatch(/apiKey/i);
    expect(lines).not.toContain(TEST_KEY);
  });
});
