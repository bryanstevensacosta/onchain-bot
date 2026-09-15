import { ThreadsPromptTemplate } from 'threads/publisher/domain/entities/threads-prompt-template.entity';
import { ThreadsLlmConfig } from 'threads/publisher/domain/entities/threads-llm-config.entity';

export interface ThreadsPromptTemplateView {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly model: string;
  readonly supportsVision: boolean;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly reasoningEffort: 'low' | 'medium' | 'high' | 'max' | null;
  readonly promptText: string;
  readonly systemPromptText: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ThreadsLlmConfigView {
  readonly id: number;
  readonly defaultTemplateId: string;
  readonly llmEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly rejectNonLatin: boolean;
  readonly dailyCap: number;
  readonly dailyResetUtcHour: number;
  readonly randomDelayMinMs: number;
  readonly randomDelayMaxMs: number;
  readonly llmMaxAttempts: number;
  readonly updatedAt: string;
}

export const toThreadsTemplateView = (
  template: ThreadsPromptTemplate,
): ThreadsPromptTemplateView => ({
  id: template.id,
  name: template.name,
  description: template.description,
  model: template.model,
  supportsVision: template.supportsVision,
  maxTokens: template.maxTokens,
  temperature: template.temperature,
  reasoningEffort: template.reasoningEffort,
  promptText: template.promptText,
  systemPromptText: template.systemPromptText,
  createdAt: template.createdAt.toISOString(),
  updatedAt: template.updatedAt.toISOString(),
});

export const toThreadsConfigView = (
  config: ThreadsLlmConfig,
): ThreadsLlmConfigView => ({
  id: config.id,
  defaultTemplateId: config.defaultTemplateId,
  llmEnabled: config.llmEnabled,
  publishingEnabled: config.publishingEnabled,
  rejectNonLatin: config.rejectNonLatin,
  dailyCap: config.dailyCap,
  dailyResetUtcHour: config.dailyResetUtcHour,
  randomDelayMinMs: config.randomDelayMinMs,
  randomDelayMaxMs: config.randomDelayMaxMs,
  llmMaxAttempts: config.llmMaxAttempts,
  updatedAt: config.updatedAt.toISOString(),
});

/**
 * Returns true when `err` looks like a Postgres unique-constraint
 * violation (PG code `23505`) — TypeORM wraps it as `QueryFailedError`
 * with a `code` property. Used by the template create/update endpoints
 * to map duplicate `name` saves to a `409 Conflict` instead of a 500.
 */
export const isThreadsUniqueViolation = (err: unknown): boolean => {
  if (err === null || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === '23505';
};
