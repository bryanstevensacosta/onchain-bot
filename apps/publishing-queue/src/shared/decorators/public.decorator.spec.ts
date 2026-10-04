import { IS_PUBLIC_KEY, Public } from './public.decorator';

describe('public decorator', () => {
  it('exposes the metadata key', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic');
  });

  it('builds a decorator factory', () => {
    expect(typeof Public()).toBe('function');
  });
});
