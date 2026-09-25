import { API_KEY_HEADER, isAuthorized } from './api-key';

describe('api-key helpers', () => {
  it('fails open when no key is configured', () => {
    expect(isAuthorized(undefined, '')).toBe(true);
    expect(isAuthorized(undefined, undefined)).toBe(true);
  });

  it('checks the exact key otherwise', () => {
    expect(isAuthorized('secret', 'secret')).toBe(true);
    expect(isAuthorized('wrong', 'secret')).toBe(false);
    expect(isAuthorized(undefined, 'secret')).toBe(false);
  });

  it('exposes the header name', () => {
    expect(API_KEY_HEADER).toBe('x-api-key');
  });
});
