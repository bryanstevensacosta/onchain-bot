import type { LlmConfig } from '../../domain/llm-config.entity';
import type { PromptTemplate } from '../../domain/prompt-template.entity';

export interface LlmConfigView {
  readonly defaultTemplateId: string;
  readonly targetChannel: string;
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

export interface PromptTemplateView {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly contentType: string;
  readonly model: string;
  readonly supportsVision: boolean;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly reasoningEffort: string | null;
  readonly promptText: string;
  readonly systemPromptText: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const toConfigView = (cfg: LlmConfig): LlmConfigView => ({
  defaultTemplateId: cfg.defaultTemplateId,
  targetChannel: cfg.targetChannel,
  llmEnabled: cfg.llmEnabled,
  publishingEnabled: cfg.publishingEnabled,
  rejectNonLatin: cfg.rejectNonLatin,
  dailyCap: cfg.dailyCap,
  dailyResetUtcHour: cfg.dailyResetUtcHour,
  randomDelayMinMs: cfg.randomDelayMinMs,
  randomDelayMaxMs: cfg.randomDelayMaxMs,
  llmMaxAttempts: cfg.llmMaxAttempts,
  updatedAt: cfg.updatedAt.toISOString(),
});

export const toTemplateView = (template: PromptTemplate): PromptTemplateView => ({
  id: template.id,
  name: template.name,
  description: template.description,
  contentType: template.contentType,
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
