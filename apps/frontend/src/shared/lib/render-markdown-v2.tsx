import { createElement, type ReactNode } from 'react';

/**
 * Sanitizing mini-renderer for dexter MarkdownV2 previews.
 *
 * The dexter bot sends cards with `parse_mode: MarkdownV2`. This component
 * renders the same subset so the operator preview matches what gets
 * published — WITHOUT `dangerouslySetInnerHTML`: the input is tokenized
 * and rebuilt as React elements, so no raw HTML ever reaches the DOM
 * (XSS-safe like `SchedulingHtmlPreview` — markup-looking attack strings
 * render as plain text).
 *
 * Supported subset: `*bold*` `_italic_` `` `code` `` ` ```pre``` `
 * `[text](url)` `~strike~`. Escaped marker chars (`\*`, `\_`, `\~`,
 * `` \` ``, `\[`, `\]`, `\(`, `\)`, `\\`) render literally. Unknown or
 * incomplete markup degrades to plain text and never crashes.
 */

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'italic' | 'code' | 'pre' | 'strike'; text: string }
  | { kind: 'link'; text: string; href: string };

const ESCAPABLE = new Set(['*', '_', '~', '`', '[', ']', '(', ')', '\\']);

/** Remove one level of MarkdownV2 backslash escapes (`\*` → `*`). */
function unescapeV2(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '\\' && i + 1 < input.length && ESCAPABLE.has(input[i + 1])) {
      out += input[i + 1];
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

function isValidHref(href: string): boolean {
  return (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('tg://')
  );
}

/**
 * Tokenize MarkdownV2 into text / formatting tokens. Every opener needs a
 * valid closer on the same pass; otherwise the opener degrades to literal
 * text (never crashes, never swallows content).
 */
function tokenizeMarkdownV2(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let text = '';

  const flushText = (): void => {
    if (text.length > 0) {
      tokens.push({ kind: 'text', text: unescapeV2(text) });
      text = '';
    }
  };

  /** Find a closer `marker` at/after `from`, skipping `\`-escaped ones. */
  const findCloser = (marker: string, from: number): number => {
    let j = from;
    while (j < input.length) {
      if (input[j] === '\\') {
        j += 2;
        continue;
      }
      if (input[j] === marker) return j;
      j++;
    }
    return -1;
  };

  while (i < input.length) {
    const ch = input[i];

    // Backslash escape: `\X` passes through; the unescape happens on flush
    // so escaped markers never open/close formatting.
    if (ch === '\\' && i + 1 < input.length && ESCAPABLE.has(input[i + 1])) {
      text += input.slice(i, i + 2);
      i += 2;
      continue;
    }

    // Fenced pre block: ```pre``` (must close; single-line or multi-line).
    if (input.startsWith('```', i)) {
      let j = i + 3;
      let closed = -1;
      while (j < input.length) {
        if (input[j] === '\\') {
          j += 2;
          continue;
        }
        if (input.startsWith('```', j)) {
          closed = j;
          break;
        }
        j++;
      }
      if (closed !== -1 && closed > i + 3) {
        flushText();
        tokens.push({
          kind: 'pre',
          text: unescapeV2(input.slice(i + 3, closed)),
        });
        i = closed + 3;
        continue;
      }
      text += '```';
      i += 3;
      continue;
    }

    // Inline code: `code` (must close with a second backtick).
    if (ch === '`') {
      const closer = findCloser('`', i + 1);
      if (closer !== -1 && closer > i + 1) {
        flushText();
        tokens.push({
          kind: 'code',
          text: unescapeV2(input.slice(i + 1, closer)),
        });
        i = closer + 1;
        continue;
      }
      text += ch;
      i++;
      continue;
    }

    // Bold / italic / strike: flat (no nesting), non-empty, closer required.
    if (ch === '*' || ch === '_' || ch === '~') {
      const closer = findCloser(ch, i + 1);
      if (closer !== -1 && closer > i + 1) {
        const inner = input.slice(i + 1, closer);
        // Flat subset: the inner span must not contain the same marker
        // unescaped — otherwise treat the opener as literal text (e.g.
        // `*a * b*` renders literally instead of guessing).
        let nested = false;
        for (let k = 0; k < inner.length; k++) {
          if (inner[k] === '\\') {
            k++;
            continue;
          }
          if (inner[k] === ch) {
            nested = true;
            break;
          }
        }
        if (!nested) {
          flushText();
          tokens.push({
            kind: ch === '*' ? 'bold' : ch === '_' ? 'italic' : 'strike',
            text: unescapeV2(inner),
          });
          i = closer + 1;
          continue;
        }
      }
      text += ch;
      i++;
      continue;
    }

    // Link: [text](url) — both parts required, url must be http(s)/tg.
    if (ch === '[') {
      const closeBracket = input.indexOf(']', i + 1);
      if (
        closeBracket !== -1 &&
        closeBracket > i + 1 &&
        input[closeBracket + 1] === '('
      ) {
        const closeParen = input.indexOf(')', closeBracket + 2);
        if (closeParen !== -1 && closeParen > closeBracket + 2) {
          const label = input.slice(i + 1, closeBracket);
          const href = input.slice(closeBracket + 2, closeParen);
          if (label.length > 0 && isValidHref(href)) {
            flushText();
            tokens.push({ kind: 'link', text: unescapeV2(label), href });
            i = closeParen + 1;
            continue;
          }
        }
      }
      text += ch;
      i++;
      continue;
    }

    text += ch;
    i++;
  }
  flushText();
  return tokens;
}

const TOKEN_CLASSES: Record<string, string> = {
  bold: 'font-semibold',
  italic: 'italic',
  code: 'bg-slate-800 text-blue-300 font-mono px-1 rounded',
  pre: 'block bg-slate-800 text-slate-200 font-mono px-2 py-1 rounded whitespace-pre overflow-x-auto',
  strike: 'line-through',
  link: 'text-blue-400 underline hover:text-blue-300',
};

/** Parse MarkdownV2 into a sanitized React node tree (never raw HTML). */
export function parseMarkdownV2(body: string): ReactNode[] {
  const safe = typeof body === 'string' ? body : '';
  return tokenizeMarkdownV2(safe).map((token, index) => {
    if (token.kind === 'text') return token.text;
    if (token.kind === 'link') {
      return createElement(
        'a',
        {
          key: index,
          className: TOKEN_CLASSES.link,
          href: token.href,
          target: '_blank',
          rel: 'noreferrer',
        },
        token.text,
      );
    }
    const element =
      token.kind === 'pre'
        ? 'pre'
        : token.kind === 'code'
          ? 'code'
          : token.kind === 'bold'
            ? 'strong'
            : token.kind === 'italic'
              ? 'em'
              : 's';
    return createElement(
      element,
      { key: index, className: TOKEN_CLASSES[token.kind] },
      token.text,
    );
  });
}

/** Live, sanitized preview of a MarkdownV2 body for the preview panel. */
export function RenderMarkdownV2({
  body,
}: {
  body: string;
}): React.ReactElement {
  return (
    <div data-testid="dexter-markdown-render" className="whitespace-pre-wrap">
      {parseMarkdownV2(body)}
    </div>
  );
}
