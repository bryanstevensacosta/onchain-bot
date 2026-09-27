import {
  avatarFileNameFor,
  sanitizeAvatarHandle,
  sourceUrlFor,
} from './avatar.constants';

/**
 * Central todo 12 (P57): avatar filenames carry the @handle.
 *
 * FAILING-FIRST: `avatarFileNameFor`, `sanitizeAvatarHandle` and
 * `sourceUrlFor` do not exist yet — this spec is RED until the
 * filename migration lands.
 */
describe('Avatar @handle filenames + t.me url (central todo 12)', () => {
  it('builds a handle-qualified filename', () => {
    expect(avatarFileNameFor('-100123', 'SomeHandle')).toBe(
      '-100123__SomeHandle.jpg',
    );
  });

  it('keeps the legacy bare filename when no handle is known (never-update)', () => {
    expect(avatarFileNameFor('-100123')).toBe('-100123.jpg');
    expect(avatarFileNameFor('-100123', null)).toBe('-100123.jpg');
    expect(avatarFileNameFor('-100123', '')).toBe('-100123.jpg');
  });

  it('sanitizes hostile handles', () => {
    expect(sanitizeAvatarHandle('@alpha')).toBe('alpha');
    expect(sanitizeAvatarHandle('Foo!')).toBe('Foo');
    expect(sanitizeAvatarHandle('!!!')).toBe('');
    expect(sanitizeAvatarHandle(null)).toBe('');
  });

  it('colliding handles map to one filename (no-dup)', () => {
    expect(avatarFileNameFor('-1001', 'Foo!')).toBe(
      avatarFileNameFor('-1001', 'Foo?'),
    );
  });

  it('different channels never share a filename', () => {
    expect(avatarFileNameFor('-1001', 'alpha')).not.toBe(
      avatarFileNameFor('-1002', 'alpha'),
    );
  });

  it('sourceUrlFor builds the t.me url', () => {
    expect(sourceUrlFor('alpha')).toBe('https://t.me/alpha');
    expect(sourceUrlFor('@alpha')).toBe('https://t.me/alpha');
    expect(sourceUrlFor(null)).toBeNull();
    expect(sourceUrlFor('')).toBeNull();
    expect(sourceUrlFor('!!!')).toBeNull();
  });
});
