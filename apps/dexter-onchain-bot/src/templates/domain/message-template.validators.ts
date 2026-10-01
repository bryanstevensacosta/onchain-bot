/**
 * MessageTemplate validators (todo 2, dexter-message-templates).
 *
 * Pure functions — no Nest, no I/O. Mirrors the SHAPE of
 * `apps/feed-publisher/src/llm/domain/prompt-template.validators.ts`
 * (canon vivo): constants + `validate*` functions throwing a local
 * domain error. Dexter owns no shared kernel `DomainError`, so the
 * error class lives here (same `code`/`details` shape as the
 * placeholders `UnknownPlaceholder` convention).
 *
 * Closed command enum: `ca|x|z|c|cc|bare` (v1). `start/help/settings/tb`
 * are intentionally OUT — usage/error strings stay hardcoded (plan §37).
 */

import { TEMPLATE_COMMANDS } from '@/placeholders/domain/placeholder-registry';
import type { TemplateCommand } from '@/placeholders/domain/placeholder-registry';

/** Alias kept for the plan contract (`command: ca|x|z|c|cc|bare`). */
export type MessageTemplateCommand = TemplateCommand;

export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 100;
export const MIN_BODY_LENGTH = 1;
export const MAX_BODY_LENGTH = 4000;
export const MIN_VERSION = 1;

export class MessageTemplateValidationError extends Error {
  public readonly code = 'MESSAGE_TEMPLATE_VALIDATION';
  public readonly details?: unknown;

  public constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'MessageTemplateValidationError';
    this.details = details;
  }
}

const fail = (message: string, details?: unknown): never => {
  throw new MessageTemplateValidationError(message, details);
};

const requireString = (raw: unknown, field: string): string => {
  if (typeof raw !== 'string') {
    fail(`MessageTemplate ${field} must be a string`, { [field]: raw });
  }
  return raw as string;
};

const trimmedNonEmpty = (raw: string, field: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    fail(`MessageTemplate ${field} cannot be empty`);
  }
  return trimmed;
};

export const validateCommand = (raw: unknown): MessageTemplateCommand => {
  if (typeof raw !== 'string') {
    fail('MessageTemplate command must be a string', { command: raw });
  }
  if (!(TEMPLATE_COMMANDS as readonly string[]).includes(raw as string)) {
    fail(
      `MessageTemplate command must be one of: ${TEMPLATE_COMMANDS.join(', ')}`,
      { command: raw },
    );
  }
  return raw as MessageTemplateCommand;
};

export const validateName = (raw: unknown): string => {
  const trimmed = trimmedNonEmpty(requireString(raw, 'name'), 'name');
  if (trimmed.length > MAX_NAME_LENGTH) {
    fail(`MessageTemplate name exceeds max length ${MAX_NAME_LENGTH}`, {
      length: trimmed.length,
      max: MAX_NAME_LENGTH,
    });
  }
  return trimmed;
};

export const validateBodyMarkdown = (raw: unknown): string => {
  const text = requireString(raw, 'bodyMarkdown');
  if (text.length < MIN_BODY_LENGTH) {
    fail('MessageTemplate bodyMarkdown cannot be empty');
  }
  if (text.length > MAX_BODY_LENGTH) {
    fail(
      `MessageTemplate bodyMarkdown exceeds max length ${MAX_BODY_LENGTH}`,
      { length: text.length, max: MAX_BODY_LENGTH },
    );
  }
  return text;
};

export const validateVersion = (raw: unknown): number => {
  if (!Number.isInteger(raw) || (raw as number) < MIN_VERSION) {
    fail(`MessageTemplate version must be an integer >= ${MIN_VERSION}`, {
      version: raw,
    });
  }
  return raw as number;
};
