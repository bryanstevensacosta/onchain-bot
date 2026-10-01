import { describe, expect, it } from 'vitest';
import { dexterPath, DEXTER_PREFIX } from './dexter-base';

describe('dexterPath', () => {
  it('prefixes same-origin paths by default', () => {
    expect(dexterPath('/api/dexter-bots/inventory')).toBe(
      `${DEXTER_PREFIX}/api/dexter-bots/inventory`,
    );
  });

  it('uses an absolute base verbatim when set', () => {
    expect(dexterPath('/api/dexter-bots/bind', 'http://localhost:4060')).toBe(
      'http://localhost:4060/api/dexter-bots/bind',
    );
  });
});
