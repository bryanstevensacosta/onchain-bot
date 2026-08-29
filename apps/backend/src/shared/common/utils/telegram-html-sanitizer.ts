/**
 * Sanitizer for Telegram Bot API `parse_mode: HTML` messages.
 *
 * Telegram's HTML mode accepts a strict allowlist of tags. This util:
 *  - keeps only the allowed tags (with validated attributes),
 *  - escapes `<`, `>`, `&`, `"` in raw text,
 *  - strips every other tag (including its matching closing tag),
 *  - validates `href` (only `http://`, `https://`, `tg://`),
 *  - wraps raw (unwrapped) URLs in `<a href="…">…</a>` — the HTML-mode
 *    equivalent of `formatUrlsAsMarkdown`.
 *
 * Lives in `shared/common/utils` (same status as `telegram-url-formatter.ts`)
 * because the crypto-news publisher adapter (a different BC from
 * crypto-news-ads) must be able to import it without crossing BC
 * boundaries.
 */

/** Telegram HTML allowlist (core.telegram.org/bots/api — HTML parse mode). */
const ALLOWED_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  'ins',
  's',
  'strike',
  'del',
  'code',
  'pre',
  'blockquote',
  'tg-spoiler',
  'a',
]);

/**
 * Mirrors `telegram-url-formatter.ts`'s URL regex: a URL preceded by
 * start-of-string, whitespace or an opening paren. `&` is matched too so
 * query strings survive (they are escaped to `&amp;` before this runs).
 */
const URL_REGEX = /(^|[\s\n(])https?:\/\/[^\s\n()<>"']+/gi;

/**
 * Stack marker pushed when an opening tag is stripped (disallowed tag,
 * invalid `href`, or a `pre` nested inside another entity). The matching
 * closing tag is then stripped too, so the output never contains orphan
 * `</tag>` fragments.
 */
const STRIPPED_SENTINEL = '__stripped__';

interface ParsedTag {
  readonly name: string;
  readonly closing: boolean;
  readonly selfClosing: boolean;
  readonly attributes: Record<string, string>;
}

function parseTag(content: string): ParsedTag | null {
  // A tag name must immediately follow `<` (or `</`); `< b>` is literal text.
  if (/^\s/.test(content)) return null;
  const trimmed = content.trim();
  if (trimmed.length === 0) return null;

  let closing = false;
  let rest = trimmed;
  if (rest.startsWith('/')) {
    closing = true;
    rest = rest.slice(1).trim();
  }

  const nameMatch = rest.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (!nameMatch) return null;
  const name = nameMatch[1].toLowerCase();
  rest = rest.slice(nameMatch[0].length).trim();

  let selfClosing = false;
  if (rest.endsWith('/')) {
    selfClosing = true;
    rest = rest.slice(0, -1).trim();
  }

  const attributes: Record<string, string> = {};
  const attrRegex =
    /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(rest)) !== null) {
    const attrName = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attributes[attrName] = value;
  }

  return { name, closing, selfClosing, attributes };
}

function isValidHref(href: string): boolean {
  return (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('tg://')
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function trimTrailingPunctuation(url: string): {
  url: string;
  trailing: string;
} {
  const punctuationRegex = /([.,;:!?]+)$/;
  const match = url.match(punctuationRegex);

  if (match) {
    return {
      url: url.slice(0, -match[1].length),
      trailing: match[1],
    };
  }

  return { url, trailing: '' };
}

function wrapRawUrls(text: string): string {
  // `text` is already HTML-escaped (escapeHtml ran first), and the URL
  // regex excludes `"`/`'`/`<>`, so the URL is safe to embed as-is.
  return text.replace(URL_REGEX, (match, prefix: string) => {
    const url = match.slice(prefix.length);
    const { url: trimmedUrl, trailing } = trimTrailingPunctuation(url);
    return `${prefix}<a href="${trimmedUrl}">${trimmedUrl}</a>${trailing}`;
  });
}

function renderOpeningTag(parsed: ParsedTag): string {
  if (parsed.name === 'blockquote') {
    return parsed.attributes.expandable !== undefined
      ? '<blockquote expandable>'
      : '<blockquote>';
  }
  return `<${parsed.name}>`;
}

/**
 * Sanitize a string for Telegram's `parse_mode: HTML`.
 *
 * The output only ever contains allowlisted tags, escaped text and
 * `<a href>` anchors with validated `http(s)://` / `tg://` targets.
 * Raw URLs in text are wrapped in anchors (unless already inside an
 * anchor or a `code`/`pre` block, where nesting is not allowed).
 */
export function sanitizeTelegramHtml(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let output = '';
  let textBuffer = '';
  const stack: string[] = [];

  const flushText = (): void => {
    if (textBuffer.length === 0) return;
    const escaped = escapeHtml(textBuffer);
    const insideAnchor = stack.includes('a');
    const insideCodeOrPre = stack.includes('code') || stack.includes('pre');
    output += insideAnchor || insideCodeOrPre ? escaped : wrapRawUrls(escaped);
    textBuffer = '';
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch !== '<') {
      textBuffer += ch;
      i++;
      continue;
    }

    const tagEnd = input.indexOf('>', i);
    if (tagEnd === -1) {
      // No closing `>` — treat the `<` as literal text (escaped on flush).
      textBuffer += '<';
      i++;
      continue;
    }

    const parsed = parseTag(input.slice(i + 1, tagEnd));
    if (parsed === null) {
      // Not a valid tag (e.g. `5 < 3`) — escape the `<` on flush.
      textBuffer += '<';
      i++;
      continue;
    }

    flushText();

    if (parsed.closing) {
      if (stack[stack.length - 1] === STRIPPED_SENTINEL) {
        // The matching opening tag was stripped — strip this too.
        stack.pop();
      } else if (ALLOWED_TAGS.has(parsed.name)) {
        output += `</${parsed.name}>`;
        const idx = stack.lastIndexOf(parsed.name);
        if (idx !== -1) stack.splice(idx, 1);
      }
      // Disallowed closing tag: strip.
    } else if (parsed.selfClosing) {
      // No Telegram HTML tag is self-closing; strip self-closing tags.
      stack.push(STRIPPED_SENTINEL);
    } else if (parsed.name === 'a') {
      const href = parsed.attributes.href;
      if (href !== undefined && isValidHref(href)) {
        output += `<a href="${escapeAttr(href)}">`;
        stack.push('a');
      } else {
        stack.push(STRIPPED_SENTINEL);
      }
    } else if (ALLOWED_TAGS.has(parsed.name)) {
      if (parsed.name === 'pre' && stack.length > 0) {
        // `pre` cannot be nested inside other entities (Telegram doc).
        stack.push(STRIPPED_SENTINEL);
      } else {
        output += renderOpeningTag(parsed);
        stack.push(parsed.name);
      }
    } else {
      stack.push(STRIPPED_SENTINEL);
    }

    i = tagEnd + 1;
  }

  flushText();
  return output;
}
