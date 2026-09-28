import { resolveDexterSendMode } from './send-mode';

describe('resolveDexterSendMode (exclusive gateway: gateway-only)', () => {
  it('always resolves gateway (legacy values fall through)', () => {
    expect(resolveDexterSendMode('direct')).toBe('gateway');
    expect(resolveDexterSendMode('dual')).toBe('gateway');
    expect(resolveDexterSendMode('gateway')).toBe('gateway');
    expect(resolveDexterSendMode(' GATEWAY ')).toBe('gateway');
  });

  it('defaults to gateway for missing or invalid values', () => {
    expect(resolveDexterSendMode(undefined)).toBe('gateway');
    expect(resolveDexterSendMode('')).toBe('gateway');
    expect(resolveDexterSendMode('cutover')).toBe('gateway');
  });
});
