import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

const fail = (message: string, details?: Record<string, unknown>): never => {
  throw new DomainError(ErrorCode.VALIDATION, message, details);
};

export const validateDefaultTemplateId = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    fail('LlmConfig defaultTemplateId must be a non-empty string');
  }
  return (raw as string).trim();
};

export const validateDailyCap = (raw: unknown): number => {
  if (!Number.isInteger(raw) || (raw as number) < 1) {
    fail('LlmConfig dailyCap must be an integer >= 1', { dailyCap: raw });
  }
  return raw as number;
};

export const validateDailyResetUtcHour = (raw: unknown): number => {
  if (!Number.isInteger(raw) || (raw as number) < 0 || (raw as number) > 23) {
    fail('LlmConfig dailyResetUtcHour must be an integer 0-23', {
      dailyResetUtcHour: raw,
    });
  }
  return raw as number;
};

export const validateRandomDelayWindow = (
  minMs: unknown,
  maxMs: unknown,
): { randomDelayMinMs: number; randomDelayMaxMs: number } => {
  if (!Number.isInteger(minMs) || (minMs as number) < 0) {
    fail('LlmConfig randomDelayMinMs must be an integer >= 0', {
      randomDelayMinMs: minMs,
    });
  }
  if (!Number.isInteger(maxMs) || (maxMs as number) < 1) {
    fail('LlmConfig randomDelayMaxMs must be an integer >= 1', {
      randomDelayMaxMs: maxMs,
    });
  }
  if ((minMs as number) > (maxMs as number)) {
    fail('LlmConfig randomDelayMinMs must be <= randomDelayMaxMs', {
      randomDelayMinMs: minMs,
      randomDelayMaxMs: maxMs,
    });
  }
  return {
    randomDelayMinMs: minMs as number,
    randomDelayMaxMs: maxMs as number,
  };
};

export const validateLlmMaxAttempts = (raw: unknown): number => {
  if (!Number.isInteger(raw) || (raw as number) < 1) {
    fail('LlmConfig llmMaxAttempts must be an integer >= 1', {
      llmMaxAttempts: raw,
    });
  }
  return raw as number;
};
