import { satisfiesScope, isValidScope } from './api-key-scope';

describe('api-key scopes', () => {
  it('grants downward only (admin > generate > read)', () => {
    expect(satisfiesScope(['admin'], 'read')).toBe(true);
    expect(satisfiesScope(['admin'], 'generate')).toBe(true);
    expect(satisfiesScope(['generate'], 'read')).toBe(true);
    expect(satisfiesScope(['read'], 'generate')).toBe(false);
    expect(satisfiesScope(['generate'], 'admin')).toBe(false);
    expect(satisfiesScope([], 'read')).toBe(false);
  });

  it('validates scope names', () => {
    expect(isValidScope('read')).toBe(true);
    expect(isValidScope('snapshot')).toBe(false);
    expect(isValidScope('nope')).toBe(false);
  });
});
