import { formatUrlsAsMarkdown } from './telegram-url-formatter';

describe('formatUrlsAsMarkdown', () => {
  describe('basic URL conversion', () => {
    it('converts single raw URL', () => {
      const input = 'Check out https://example.com for more info';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe(
        'Check out [https://example.com](https://example.com) for more info',
      );
    });

    it('converts multiple URLs', () => {
      const input = 'Visit https://example.com and https://test.org';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe(
        'Visit [https://example.com](https://example.com) and [https://test.org](https://test.org)',
      );
    });

    it('leaves plain text unchanged', () => {
      const input = 'Hello world';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe('Hello world');
    });

    it('handles empty string', () => {
      const input = '';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe('');
    });

    it('handles URL with special characters (query params, anchors)', () => {
      const input =
        'See https://example.com/path?query=1&other=2#section for details';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe(
        'See [https://example.com/path?query=1&other=2#section](https://example.com/path?query=1&other=2#section) for details',
      );
    });
  });

  describe('already-formatted links', () => {
    it('leaves already-formatted [text](url) Markdown links unchanged', () => {
      const input = 'Check out [Example](https://example.com) for more info';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe(
        'Check out [Example](https://example.com) for more info',
      );
    });

    it('converts URLs inside backtick code spans', () => {
      const input = 'Use `https://example.com` in code';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe('Use `https://example.com` in code');
    });
  });

  describe('URL positioning', () => {
    it('converts URL after newline', () => {
      const input = 'Check this:\nhttps://example.com';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe(
        'Check this:\n[https://example.com](https://example.com)',
      );
    });

    it('handles http:// URLs', () => {
      const input = 'Visit http://example.com for info';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe(
        'Visit [http://example.com](http://example.com) for info',
      );
    });

    it('handles URL at beginning of text', () => {
      const input = 'https://example.com is the site';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe(
        '[https://example.com](https://example.com) is the site',
      );
    });

    it('handles URL followed by period (sentence end)', () => {
      const input = 'Visit https://example.com.';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe('Visit [https://example.com](https://example.com).');
    });

    it('handles URL inside parentheses', () => {
      const input = 'Check (https://example.com) for info';
      const output = formatUrlsAsMarkdown(input);
      expect(output).toBe(
        'Check ([https://example.com](https://example.com)) for info',
      );
    });
  });
});
