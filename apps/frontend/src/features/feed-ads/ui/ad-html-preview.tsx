import { createElement, type ReactNode } from 'react';

/**
 * Sanitizing mini-renderer for the ad-body preview.
 *
 * The backend sanitizes ad bodies for Telegram's `parse_mode: HTML` (see
 * `apps/backend/src/shared/common/utils/telegram-html-sanitizer.ts`). This
 * component renders the same allowlist subset so the operator preview matches
 * what gets published — WITHOUT `dangerouslySetInnerHTML`: the input is
 * tokenized and rebuilt as React elements, so no raw HTML ever reaches the
 * DOM. Disallowed tags are stripped (their text content is kept inline),
 * invalid `<a href>` targets are dropped, and `<a>` is the only tag that
 * carries an attribute.
 */

/** Telegram HTML allowlist (mirrors the backend sanitizer). */
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

/** Tailwind classes applied per tag in the preview. */
const TAG_CLASSES: Record<string, string> = {
  b: 'font-semibold',
  strong: 'font-semibold',
  i: 'italic',
  em: 'italic',
  u: 'underline',
  ins: 'underline',
  s: 'line-through',
  strike: 'line-through',
  del: 'line-through',
  code: 'bg-slate-800 text-blue-300 font-mono px-1 rounded',
  pre: 'block bg-slate-800 text-slate-200 font-mono px-2 py-1 rounded whitespace-pre overflow-x-auto',
  blockquote: 'border-l-2 border-slate-600 pl-3 text-slate-300 italic',
  'tg-spoiler': 'bg-slate-700 text-slate-700 rounded px-0.5 cursor-help',
  a: 'text-blue-400 underline hover:text-blue-300',
};

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'open'; name: string; href: string | null }
  | { kind: 'close'; name: string };

function isValidHref(href: string): boolean {
  return (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('tg://')
  );
}

const TAG_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9-]*/;

/**
 * Tokenize a body into text / tag tokens. A malformed `<` (no closing `>`,
 * whitespace after it, or no tag name) is treated as literal text so `5 < 3`
 * survives untouched.
 */
function tokenizeAdHtml(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let text = '';

  const flushText = (): void => {
    if (text.length > 0) {
      tokens.push({ kind: 'text', text });
      text = '';
    }
  };

  while (i < input.length) {
    const ch = input[i];
    if (ch !== '<') {
      text += ch;
      i++;
      continue;
    }
    const tagEnd = input.indexOf('>', i + 1);
    if (tagEnd === -1) {
      text += '<';
      i++;
      continue;
    }
    const inner = input.slice(i + 1, tagEnd);
    // A tag name must immediately follow `<` (or `</`); `< b>` is text.
    if (/^\s/.test(inner)) {
      text += '<';
      i++;
      continue;
    }
    const trimmed = inner.trim();
    if (trimmed.length === 0) {
      text += '<';
      i++;
      continue;
    }

    let closing = false;
    let rest = trimmed;
    if (rest.startsWith('/')) {
      closing = true;
      rest = rest.slice(1).trim();
    }
    const nameMatch = rest.match(TAG_NAME_REGEX);
    if (!nameMatch) {
      text += '<';
      i++;
      continue;
    }
    const name = nameMatch[0].toLowerCase();
    rest = rest.slice(nameMatch[0].length).trim();

    // No Telegram HTML tag is self-closing — strip it like the backend.
    if (rest.endsWith('/')) {
      flushText();
      i = tagEnd + 1;
      continue;
    }

    let href: string | null = null;
    const attrRegex =
      /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(rest)) !== null) {
      if (match[1].toLowerCase() === 'href') {
        href = match[2] ?? match[3] ?? match[4] ?? '';
      }
    }

    flushText();
    tokens.push({ kind: closing ? 'close' : 'open', name, href });
    i = tagEnd + 1;
  }
  flushText();
  return tokens;
}

interface ParseResult {
  nodes: ReactNode[];
  index: number;
}

/**
 * Recursively build a React node tree from the token stream. Each `open` tag
 * consumes tokens until its matching `close` tag; a close tag with no open
 * sibling simply ends the current frame. Disallowed/invalid tags contribute
 * their children inline (content preserved, formatting dropped).
 */
function buildNodes(tokens: Token[], start: number): ParseResult {
  const nodes: ReactNode[] = [];
  let i = start;
  let key = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (token.kind === 'text') {
      nodes.push(token.text);
      i++;
      continue;
    }
    if (token.kind === 'close') {
      return { nodes, index: i };
    }

    const name = token.name;
    const isAllowed = ALLOWED_TAGS.has(name);
    const hrefValid =
      name !== 'a' || (token.href !== null && isValidHref(token.href));
    const inner = buildNodes(tokens, i + 1);
    const children = inner.nodes;
    i = inner.index;
    const closing = tokens[i];
    if (
      closing !== undefined &&
      closing.kind === 'close' &&
      closing.name === name
    ) {
      i++; // consume the matching close tag
    }

    if (!isAllowed || !hrefValid) {
      nodes.push(...children);
      continue;
    }

    key++;
    const elementName = name === 'tg-spoiler' ? 'span' : name;
    nodes.push(
      createElement(
        elementName,
        {
          key,
          className: TAG_CLASSES[name],
          ...(name === 'a' && token.href !== null ? { href: token.href } : {}),
        },
        ...children,
      ),
    );
  }
  return { nodes, index: i };
}

/** Parse an ad body into a sanitized React node tree (never raw HTML). */
export function parseAdHtml(body: string): ReactNode[] {
  return buildNodes(tokenizeAdHtml(body), 0).nodes;
}

/** Live, sanitized preview of an ad body for the modal. */
export function AdHtmlPreview({ body }: { body: string }): React.ReactElement {
  return <div className="whitespace-pre-wrap">{parseAdHtml(body)}</div>;
}
