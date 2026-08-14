import { sanitizeTelegramHtml } from './telegram-html-sanitizer';

describe('sanitizeTelegramHtml', () => {
  describe('allowlist', () => {
    it('keeps allowed inline tags', () => {
      expect(
        sanitizeTelegramHtml(
          '<b>bold</b> <strong>strong</strong> <i>italic</i> <em>em</em> <u>under</u> <ins>ins</ins> <s>strike</s> <strike>strike2</strike> <del>del</del> <code>code</code> <tg-spoiler>spoiler</tg-spoiler>',
        ),
      ).toBe(
        '<b>bold</b> <strong>strong</strong> <i>italic</i> <em>em</em> <u>under</u> <ins>ins</ins> <s>strike</s> <strike>strike2</strike> <del>del</del> <code>code</code> <tg-spoiler>spoiler</tg-spoiler>',
      );
    });

    it('keeps blockquote and pre at top level', () => {
      expect(sanitizeTelegramHtml('<blockquote>quote</blockquote>')).toBe(
        '<blockquote>quote</blockquote>',
      );
      expect(sanitizeTelegramHtml('<pre>code block</pre>')).toBe(
        '<pre>code block</pre>',
      );
    });

    it('keeps blockquote expandable attribute', () => {
      expect(
        sanitizeTelegramHtml('<blockquote expandable>quote</blockquote>'),
      ).toBe('<blockquote expandable>quote</blockquote>');
    });

    it('keeps anchors with valid http(s) href and strips other attributes', () => {
      expect(
        sanitizeTelegramHtml(
          '<a href="https://example.com" onclick="evil()">link</a>',
        ),
      ).toBe('<a href="https://example.com">link</a>');
    });

    it('keeps anchors with tg:// href', () => {
      expect(
        sanitizeTelegramHtml('<a href="tg://resolve?domain=x">x</a>'),
      ).toBe('<a href="tg://resolve?domain=x">x</a>');
    });
  });

  describe('injection resistance', () => {
    it('escapes a bare < that starts a script-like sequence', () => {
      expect(sanitizeTelegramHtml('b><script>alert(1)</script>')).toBe(
        'b&gt;alert(1)',
      );
    });

    it('strips script tags but keeps their text', () => {
      expect(sanitizeTelegramHtml('<script>alert(1)</script>')).toBe(
        'alert(1)',
      );
    });

    it('strips disallowed tags entirely', () => {
      expect(sanitizeTelegramHtml('<img src=x onerror=alert(1)>')).toBe('');
      expect(sanitizeTelegramHtml('<div>content</div>')).toBe('content');
      expect(sanitizeTelegramHtml('<span>content</span>')).toBe('content');
    });

    it('strips anchors with javascript: href', () => {
      expect(sanitizeTelegramHtml('<a href="javascript:alert(1)">x</a>')).toBe(
        'x',
      );
    });

    it('strips anchors with data: href', () => {
      expect(
        sanitizeTelegramHtml('<a href="data:text/html;base64,x">x</a>'),
      ).toBe('x');
    });

    it('strips anchors without href', () => {
      expect(sanitizeTelegramHtml('<a>x</a>')).toBe('x');
    });

    it('escapes <, >, & and " in raw text', () => {
      expect(sanitizeTelegramHtml('a < b > c & "d"')).toBe(
        'a &lt; b &gt; c &amp; &quot;d&quot;',
      );
    });

    it('treats a < not followed by a valid tag name as literal text', () => {
      expect(sanitizeTelegramHtml('5 < 3 > 2')).toBe('5 &lt; 3 &gt; 2');
    });

    it('treats an unterminated < as literal text', () => {
      expect(sanitizeTelegramHtml('a < b')).toBe('a &lt; b');
    });

    it('strips self-closing tags', () => {
      expect(sanitizeTelegramHtml('<br/>')).toBe('');
    });

    it('strips nested pre inside another entity', () => {
      expect(sanitizeTelegramHtml('<b><pre>code</pre></b>')).toBe(
        '<b>code</b>',
      );
    });

    it('strips nested disallowed tags with matching closing tags', () => {
      expect(sanitizeTelegramHtml('<b><script>x</script></b>')).toBe(
        '<b>x</b>',
      );
    });
  });

  describe('raw URL wrapping', () => {
    it('wraps a raw URL in an anchor', () => {
      expect(sanitizeTelegramHtml('Check https://example.com now')).toBe(
        'Check <a href="https://example.com">https://example.com</a> now',
      );
    });

    it('wraps a raw URL at the start of the text', () => {
      expect(sanitizeTelegramHtml('https://example.com')).toBe(
        '<a href="https://example.com">https://example.com</a>',
      );
    });

    it('does not double-wrap an already wrapped URL', () => {
      expect(
        sanitizeTelegramHtml(
          '<a href="https://example.com">https://example.com</a>',
        ),
      ).toBe('<a href="https://example.com">https://example.com</a>');
    });

    it('moves trailing punctuation outside the anchor', () => {
      expect(sanitizeTelegramHtml('See https://example.com.')).toBe(
        'See <a href="https://example.com">https://example.com</a>.',
      );
    });

    it('escapes & in URL query strings', () => {
      expect(sanitizeTelegramHtml('See https://example.com?a=1&b=2')).toBe(
        'See <a href="https://example.com?a=1&amp;b=2">https://example.com?a=1&amp;b=2</a>',
      );
    });

    it('does not wrap URLs inside code or pre blocks', () => {
      expect(sanitizeTelegramHtml('<code>https://example.com</code>')).toBe(
        '<code>https://example.com</code>',
      );
      expect(sanitizeTelegramHtml('<pre>https://example.com</pre>')).toBe(
        '<pre>https://example.com</pre>',
      );
    });
  });

  describe('unicode', () => {
    it('preserves emoji and UTF-16 sequences', () => {
      expect(sanitizeTelegramHtml('🎉 <b>hola</b> 😀')).toBe(
        '🎉 <b>hola</b> 😀',
      );
    });

    it('preserves emoji before entities', () => {
      expect(sanitizeTelegramHtml('🎉 <b>bold</b>')).toBe('🎉 <b>bold</b>');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeTelegramHtml('')).toBe('');
    });

    it('returns plain text unchanged', () => {
      expect(sanitizeTelegramHtml('just text')).toBe('just text');
    });
  });
});
