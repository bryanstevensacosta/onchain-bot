import { UrlNormalizerService } from './url-normalizer.service';

describe('UrlNormalizerService', () => {
  const normalizer = new UrlNormalizerService();

  it('extracts urls from text', () => {
    const urls = normalizer.extractUrls(
      'see https://example.com/a and http://x.io/b?x=1',
    );
    expect(urls).toHaveLength(2);
  });

  it('drops tracking params when normalizing', () => {
    expect(
      normalizer.normalizeUrl('https://example.com/a?utm_source=x&keep=1'),
    ).toBe('https://example.com/a?keep=1');
  });

  it('drops trailing slashes and lowercases the host', () => {
    expect(normalizer.normalizeUrl('https://EXAMPLE.com/a/')).toBe(
      'https://example.com/a',
    );
  });

  it('hashes the normalized form so tracked variants collide', () => {
    const a = normalizer.hashUrl('https://example.com/a?utm_source=x');
    const b = normalizer.hashUrl('https://example.com/a');
    expect(a).toBe(b);
  });

  it('returns the original string when parsing fails', () => {
    expect(normalizer.normalizeUrl('not a url')).toBe('not a url');
  });
});
