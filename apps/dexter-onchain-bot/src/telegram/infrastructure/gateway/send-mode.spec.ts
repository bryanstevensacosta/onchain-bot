import { resolveDexterSendMode } from './send-mode';

describe('resolveDexterSendMode (dexter gateway todo 6)', () => {
  it('honors explicit modes', () => {
    expect(resolveDexterSendMode('direct')).toBe('direct');
    expect(resolveDexterSendMode('dual')).toBe('dual');
    expect(resolveDexterSendMode('gateway')).toBe('gateway');
    expect(resolveDexterSendMode(' GATEWAY ')).toBe('gateway');
  });

  it('defaults to dual for missing or invalid values', () => {
    expect(resolveDexterSendMode(undefined)).toBe('dual');
    expect(resolveDexterSendMode('')).toBe('dual');
    expect(resolveDexterSendMode('cutover')).toBe('dual');
  });
});
