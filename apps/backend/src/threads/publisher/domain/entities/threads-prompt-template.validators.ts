import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 100;
export const MIN_MAX_TOKENS = 1;
export const MAX_MAX_TOKENS = 8000;
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 2;

export type ThreadsReasoningEffort = 'low' | 'medium' | 'high' | 'max';

const ALLOWED_REASONING_EFFORTS: ReadonlyArray<ThreadsReasoningEffort | null> =
  [null, 'low', 'medium', 'high', 'max'];

const requireString = (raw: unknown, field: string): string => {
  if (raw === null || raw === undefined) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `ThreadsPromptTemplate ${field} cannot be null/undefined`,
    );
  }
  if (typeof raw !== 'string') {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `ThreadsPromptTemplate ${field} must be a string`,
    );
  }
  return raw;
};

const trimmedNonEmpty = (raw: string, field: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `ThreadsPromptTemplate ${field} cannot be empty`,
    );
  }
  return trimmed;
};

export const validateName = (raw: unknown): string => {
  const value = requireString(raw, 'name');
  const trimmed = trimmedNonEmpty(value, 'name');
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `ThreadsPromptTemplate name exceeds max length ${MAX_NAME_LENGTH}`,
      { length: trimmed.length, max: MAX_NAME_LENGTH },
    );
  }
  return trimmed;
};

export const validateDescription = (raw: unknown): string | null => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'ThreadsPromptTemplate description must be a string or null',
    );
  }
  return raw;
};

export const validateModel = (raw: unknown): string => {
  const value = requireString(raw, 'model');
  return trimmedNonEmpty(value, 'model');
};

export const validateMaxTokens = (raw: unknown): number => {
  if (
    !Number.isFinite(raw) ||
    (raw as number) < MIN_MAX_TOKENS ||
    (raw as number) > MAX_MAX_TOKENS
  ) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `ThreadsPromptTemplate maxTokens must be between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}`,
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
    throw new DomainError(
      ErrorCode.VALIDATION,
      `ThreadsPromptTemplate temperature must be between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}`,
      { temperature: raw },
    );
  }
  return raw as number;
};

export const validateReasoningEffort = (
  raw: unknown,
): ThreadsReasoningEffort | null => {
  if (
    !ALLOWED_REASONING_EFFORTS.includes(raw as ThreadsReasoningEffort | null)
  ) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'ThreadsPromptTemplate reasoningEffort must be one of: null, low, medium, high, max',
      { reasoningEffort: raw },
    );
  }
  return raw as ThreadsReasoningEffort | null;
};

export const validatePromptText = (raw: unknown): string => {
  const value = requireString(raw, 'promptText');
  return trimmedNonEmpty(value, 'promptText');
};
