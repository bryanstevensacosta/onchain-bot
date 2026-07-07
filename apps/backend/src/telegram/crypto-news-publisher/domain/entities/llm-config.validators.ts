import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export const MIN_DAILY_RESET_HOUR = 0;
export const MAX_DAILY_RESET_HOUR = 23;
export const MIN_DELAY_MS = 0;

const requireInteger = (
  raw: unknown,
  field: string,
  min: number,
  max: number,
  label: string,
): number => {
  if (raw === null || raw === undefined || !Number.isInteger(raw)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `LlmConfig.${field} must be an integer in [${min}, ${max}] (got ${String(raw)})`,
      { [field]: raw },
    );
  }
  if ((raw as number) < min || (raw as number) > max) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `LlmConfig.${field} must be an integer in [${min}, ${max}]`,
      { [field]: raw },
    );
  }
  void label;
  return raw as number;
};

const requirePositive = (raw: unknown, field: string): number => {
  if (
    raw === null ||
    raw === undefined ||
    !Number.isFinite(raw) ||
    (raw as number) <= 0
  ) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `LlmConfig.${field} must be a positive number`,
      { [field]: raw },
    );
  }
  return raw as number;
};

export const validateDefaultTemplateId = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'LlmConfig.defaultTemplateId must be a non-empty string',
    );
  }
  return raw.trim();
};

export const validateDailyCap = (raw: unknown): number =>
  requirePositive(raw, 'dailyCap');

export const validateDailyResetUtcHour = (raw: unknown): number =>
  requireInteger(
    raw,
    'dailyResetUtcHour',
    MIN_DAILY_RESET_HOUR,
    MAX_DAILY_RESET_HOUR,
    'UTC hour',
  );

export const validateRandomDelayMinMs = (raw: unknown): number => {
  if (
    raw === null ||
    raw === undefined ||
    !Number.isFinite(raw) ||
    (raw as number) < MIN_DELAY_MS
  ) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `LlmConfig.randomDelayMinMs must be >= ${MIN_DELAY_MS}`,
      { randomDelayMinMs: raw },
    );
  }
  return raw as number;
};

export const validateRandomDelayWindow = (
  minMs: unknown,
  maxMs: unknown,
): { randomDelayMinMs: number; randomDelayMaxMs: number } => {
  const validatedMin = validateRandomDelayMinMs(minMs);
  const validatedMax = requirePositive(maxMs, 'randomDelayMaxMs');
  if (validatedMax <= validatedMin) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'LlmConfig.randomDelayMaxMs must be greater than randomDelayMinMs',
      { randomDelayMinMs: validatedMin, randomDelayMaxMs: validatedMax },
    );
  }
  return { randomDelayMinMs: validatedMin, randomDelayMaxMs: validatedMax };
};

export const validateLlmMaxAttempts = (raw: unknown): number =>
  requireInteger(raw, 'llmMaxAttempts', 1, Number.MAX_SAFE_INTEGER, 'positive');
