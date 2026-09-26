/**
 * PromptTemplate domain (ai-ml, todo 1): versioned global catalog.
 *
 * One row per (name, version). Consumers reference templates by
 * name+version (`resolve({ name, version })`); the active version is
 * the rollback pointer (`activate` moves it, history is immutable).
 * `contentType` scopes reuse: `global` applies everywhere
 * (`crypto-news` / `threads` mirror the feed-publisher migration
 * source — read-only, never imported).
 */

export type PromptContentType = 'crypto-news' | 'threads' | 'global';

const ALLOWED_CONTENT_TYPES: ReadonlyArray<PromptContentType> = [
  'crypto-news',
  'threads',
  'global',
];

export interface PromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly content: string;
  readonly systemContent: string;
  readonly variables: ReadonlyArray<string>;
  readonly contentType: PromptContentType;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PromptInput {
  readonly name: string;
  readonly content: string;
  readonly systemContent?: string;
  readonly contentType?: string;
}

const VARIABLE_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Extract sorted unique {{variable}} names from content parts. */
export function extractVariables(...parts: ReadonlyArray<string>): ReadonlyArray<string> {
  const found = new Set<string>();
  for (const part of parts) {
    VARIABLE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = VARIABLE_RE.exec(part)) !== null) {
      const name = (match[1] ?? '').trim();
      if (name) {
        found.add(name);
      }
    }
  }
  return [...found].sort();
}

export interface ValidatedPromptInput {
  readonly name: string;
  readonly content: string;
  readonly systemContent: string;
  readonly contentType: PromptContentType;
  readonly variables: ReadonlyArray<string>;
}

const fail = (message: string): never => {
  throw new Error(message);
};

const nonEmpty = (raw: unknown, field: string): string => {
  if (typeof raw !== 'string') {
    fail(`PromptTemplate ${field} must be a non-empty string`);
  }
  const text: string = raw as string;
  if (text.trim().length === 0) {
    fail(`PromptTemplate ${field} must be a non-empty string`);
  }
  return text.trim();
};

/** Validate + normalize create/version input (throws on invalid). */
export function validatePromptInput(input: {
  readonly name: string;
  readonly content: string;
  readonly systemContent?: string;
  readonly contentType?: string;
}): ValidatedPromptInput {
  const name = nonEmpty(input.name, 'name');
  if (name.length > 100) {
    fail(`PromptTemplate name exceeds max length 100 (got ${name.length})`);
  }
  const content = nonEmpty(input.content, 'content');
  const systemContent = (input.systemContent ?? '').trim();
  const rawType = input.contentType ?? 'global';
  if (!ALLOWED_CONTENT_TYPES.includes(rawType as PromptContentType)) {
    fail(
      `PromptTemplate contentType must be one of: crypto-news, threads, global (got ${rawType})`,
    );
  }
  const contentType = rawType as PromptContentType;
  return {
    name,
    content,
    systemContent,
    contentType,
    variables: extractVariables(content, systemContent),
  };
}
