import { ContentTypeVo } from './content-type.vo';

describe('ContentTypeVo', () => {
  it('accepts the unified discriminator values', () => {
    expect(ContentTypeVo.from('crypto-news').raw).toBe('crypto-news');
    expect(ContentTypeVo.from('threads').isThreads()).toBe(true);
    expect(ContentTypeVo.from('crypto-news').isThreads()).toBe(false);
  });

  it('rejects unknown types', () => {
    expect(() => ContentTypeVo.from('kol')).toThrow(
      'Unsupported content type: kol',
    );
  });

  it('equals compares by value', () => {
    expect(
      ContentTypeVo.from('crypto-news').equals(
        ContentTypeVo.from('crypto-news'),
      ),
    ).toBe(true);
  });
});
