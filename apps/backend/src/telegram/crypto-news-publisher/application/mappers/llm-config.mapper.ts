import { PromptTemplate } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.entity';
import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';

export interface PromptTemplateView {
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

export interface LlmConfigView {
  readonly id: number;
  readonly defaultTemplateId: string;
  readonly targetChannel: string;
  readonly enabled: boolean;
  readonly rejectNonLatin: boolean;
  readonly dailyCap: number;
  readonly dailyResetUtcHour: number;
  readonly randomDelayMinMs: number;
  readonly randomDelayMaxMs: number;
  readonly llmMaxAttempts: number;
  readonly updatedAt: string;
}

export const toTemplateView = (
  template: PromptTemplate,
): PromptTemplateView => ({
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

export const toConfigView = (config: LlmConfig): LlmConfigView => ({
  id: config.id,
  defaultTemplateId: config.defaultTemplateId,
  targetChannel: config.targetChannel,
  enabled: config.enabled,
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
export const isUniqueViolation = (err: unknown): boolean => {
  if (err === null || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === '23505';
};
