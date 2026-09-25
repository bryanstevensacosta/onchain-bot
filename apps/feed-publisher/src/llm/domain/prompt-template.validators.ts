import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 100;
export const MIN_MAX_TOKENS = 1;
export const MAX_MAX_TOKENS = 8000;
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 2;

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'max';

export type TemplateContentType = 'crypto-news' | 'threads' | 'global';

const ALLOWED_REASONING_EFFORTS: ReadonlyArray<ReasoningEffort | null> = [
  null,
  'low',
  'medium',
  'high',
  'max',
];

const ALLOWED_CONTENT_TYPES: ReadonlyArray<TemplateContentType> = [
  'crypto-news',
  'threads',
  'global',
];

const fail = (message: string, details?: Record<string, unknown>): never => {
  throw new DomainError(ErrorCode.VALIDATION, message, details);
};

const requireString = (raw: unknown, field: string): string => {
  if (typeof raw !== 'string') {
    fail(`PromptTemplate ${field} must be a string`);
  }
  return raw as string;
};

const trimmedNonEmpty = (raw: string, field: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    fail(`PromptTemplate ${field} cannot be empty`);
  }
  return trimmed;
};

export const validateName = (raw: unknown): string => {
  const trimmed = trimmedNonEmpty(requireString(raw, 'name'), 'name');
  if (trimmed.length > MAX_NAME_LENGTH) {
    fail(`PromptTemplate name exceeds max length ${MAX_NAME_LENGTH}`, {
      length: trimmed.length,
      max: MAX_NAME_LENGTH,
    });
  }
  return trimmed;
};

export const validateDescription = (raw: unknown): string | null => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    fail('PromptTemplate description must be a string or null');
  }
  return raw as string;
};

export const validateModel = (raw: unknown): string => {
  return trimmedNonEmpty(requireString(raw, 'model'), 'model');
};

export const validateMaxTokens = (raw: unknown): number => {
  if (
    !Number.isFinite(raw) ||
    (raw as number) < MIN_MAX_TOKENS ||
    (raw as number) > MAX_MAX_TOKENS
  ) {
    fail(
      `PromptTemplate maxTokens must be between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}`,
      { maxTokens: raw },
    );
  }
  return raw as number;
};

export const validateTemperature = (raw: unknown): number => {
  if (
    !Number.isFinite(raw) ||
    (raw as number) < MIN_TEMPERATURE ||
    (raw as number) > MAX_TEMPERATURE
  ) {
    fail(
      `PromptTemplate temperature must be between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}`,
      { temperature: raw },
    );
  }
  return raw as number;
};

export const validateReasoningEffort = (raw: unknown): ReasoningEffort | null => {
  if (!ALLOWED_REASONING_EFFORTS.includes(raw as ReasoningEffort | null)) {
    fail(
      'PromptTemplate reasoningEffort must be one of: null, low, medium, high, max',
      { reasoningEffort: raw },
    );
  }
  return raw as ReasoningEffort | null;
};

export const validatePromptText = (raw: unknown): string => {
  return trimmedNonEmpty(requireString(raw, 'promptText'), 'promptText');
};

export const validateContentType = (raw: unknown): TemplateContentType => {
  if (raw === undefined || raw === null) return 'global';
  if (!ALLOWED_CONTENT_TYPES.includes(raw as TemplateContentType)) {
    fail(
      'PromptTemplate contentType must be one of: crypto-news, threads, global',
      { contentType: raw },
    );
  }
  return raw as TemplateContentType;
};
