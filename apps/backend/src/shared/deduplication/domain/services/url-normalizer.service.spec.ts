import { UrlNormalizerService } from './url-normalizer.service';

describe('UrlNormalizerService', () => {
  describe('extractUrls', () => {
    it('should extract single URL', () => {
      const result = UrlNormalizerService.extractUrls(
        'Check https://example.com for more',
      );
      expect(result).toEqual(['https://example.com']);
    });

    it('should extract multiple URLs', () => {
      const content = 'Visit https://foo.com and http://bar.com today';
      const result = UrlNormalizerService.extractUrls(content);
      expect(result).toEqual(['https://foo.com', 'http://bar.com']);
    });

    it('should return empty array for no URLs', () => {
      const result = UrlNormalizerService.extractUrls('No URLs here');
      expect(result).toEqual([]);
    });

    it('should handle URLs with query params', () => {
      const result = UrlNormalizerService.extractUrls(
        'Link: https://example.com?foo=bar',
      );
      expect(result).toEqual(['https://example.com?foo=bar']);
    });
  });

  describe('normalize', () => {
    it('should return URL without tracking params', () => {
      const url = 'https://example.com?utm_source=twitter&utm_medium=social';
      const result = UrlNormalizerService.normalize(url);
      expect(result).toBe('https://example.com');
    });

    it('should remove fbclid', () => {
      const url = 'https://example.com?fbclid=abc123';
      const result = UrlNormalizerService.normalize(url);
      expect(result).toBe('https://example.com');
    });

    it('should remove gclid', () => {
      const url = 'https://example.com?gclid=xyz789';
      const result = UrlNormalizerService.normalize(url);
      expect(result).toBe('https://example.com');
    });

    it('should remove ref param', () => {
      const url = 'https://example.com?ref=twitter';
      const result = UrlNormalizerService.normalize(url);
      expect(result).toBe('https://example.com');
    });

    it('should preserve non-tracking params', () => {
      const url = 'https://example.com?id=123&page=5';
      const result = UrlNormalizerService.normalize(url);
      expect(result).toBe('https://example.com/?id=123&page=5');
    });

    it('should handle URL without params', () => {
      const url = 'https://example.com';
      const result = UrlNormalizerService.normalize(url);
      expect(result).toBe('https://example.com');
    });

    it('should remove trailing slash', () => {
      const url = 'https://example.com/';
      const result = UrlNormalizerService.normalize(url);
      expect(result).toBe('https://example.com');
    });

    it('should handle invalid URL gracefully', () => {
      const url = 'not-a-url';
      const result = UrlNormalizerService.normalize(url);
      expect(result).toBe('not-a-url');
    });
  });

  describe('normalizeAll', () => {
    it('should normalize all URLs in array', () => {
      const urls = [
        'https://example.com?utm_source=twitter',
        'https://test.com?fbclid=abc',
      ];
      const result = UrlNormalizerService.normalizeAll(urls);
      expect(result).toEqual(['https://example.com', 'https://test.com']);
    });
  });

  describe('hash', () => {
    it('should return consistent hash for same URL', () => {
      const url = 'https://example.com?utm_source=twitter';
      const hash1 = UrlNormalizerService.hash(url);
      const hash2 = UrlNormalizerService.hash(url);
      expect(hash1).toBe(hash2);
    });

    it('should return same hash for URLs that normalize to same', () => {
      const hash1 = UrlNormalizerService.hash(
        'https://example.com?utm_source=twitter',
      );
      const hash2 = UrlNormalizerService.hash('https://example.com');
      expect(hash1).toBe(hash2);
    });

    it('should return 64-character hex string', () => {
      const hash = UrlNormalizerService.hash('https://example.com');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
