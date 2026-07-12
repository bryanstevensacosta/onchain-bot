import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'max' | null;

export interface LlmModel {
  readonly id: string;
  readonly ownedBy?: string;
}

export interface PromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly reasoningEffort: 'low' | 'medium' | 'high' | 'max' | null;
  readonly promptText: string;
  readonly systemPromptText: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LlmConfig {
  readonly id: number;
  readonly defaultTemplateId: string;
  readonly targetChannel: string;
  readonly enabled: boolean;
  readonly dailyCap: number;
  readonly dailyResetUtcHour: number;
  readonly randomDelayMinMs: number;
  readonly randomDelayMaxMs: number;
  readonly llmMaxAttempts: number;
  readonly updatedAt: string;
}

export type CreatePromptTemplateBody = Omit<
  PromptTemplate,
  'id' | 'createdAt' | 'updatedAt'
>;

export type UpdatePromptTemplateBody = Partial<CreatePromptTemplateBody>;

export type UpdateLlmConfigBody = Partial<Omit<LlmConfig, 'id' | 'updatedAt'>>;

export const llmConfigKeys = {
  all: ['crypto-news-publisher', 'llm'] as const,
  models: () => [...llmConfigKeys.all, 'models'] as const,
  config: () => [...llmConfigKeys.all, 'config'] as const,
  templates: () => [...llmConfigKeys.all, 'templates'] as const,
  template: (id: string) => [...llmConfigKeys.all, 'templates', id] as const,
};

export async function fetchLlmModels(): Promise<ReadonlyArray<LlmModel>> {
  return httpGet<ReadonlyArray<LlmModel>>('/crypto-news-publisher/llm/models');
}

export async function fetchLlmConfig(): Promise<LlmConfig> {
  return httpGet<LlmConfig>('/crypto-news-publisher/llm/config');
}

export async function updateLlmConfig(
  body: UpdateLlmConfigBody,
): Promise<LlmConfig> {
  return httpPatch<UpdateLlmConfigBody, LlmConfig>(
    '/crypto-news-publisher/llm/config',
    body,
  );
}

export async function fetchTemplates(): Promise<ReadonlyArray<PromptTemplate>> {
  return httpGet<ReadonlyArray<PromptTemplate>>(
    '/crypto-news-publisher/llm/templates',
  );
}

export async function fetchTemplate(id: string): Promise<PromptTemplate> {
  return httpGet<PromptTemplate>(
    `/crypto-news-publisher/llm/templates/${encodeURIComponent(id)}`,
  );
}

export async function createTemplate(
  body: CreatePromptTemplateBody,
): Promise<PromptTemplate> {
  return httpPost<CreatePromptTemplateBody, PromptTemplate>(
    '/crypto-news-publisher/llm/templates',
    body,
  );
}

export async function updateTemplate(
  id: string,
  body: UpdatePromptTemplateBody,
): Promise<PromptTemplate> {
  return httpPatch<UpdatePromptTemplateBody, PromptTemplate>(
    `/crypto-news-publisher/llm/templates/${encodeURIComponent(id)}`,
    body,
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  await httpDelete<void>(
    `/crypto-news-publisher/llm/templates/${encodeURIComponent(id)}`,
  );
}
