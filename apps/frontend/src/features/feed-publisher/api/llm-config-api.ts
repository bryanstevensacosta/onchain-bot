import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'max' | null;

export interface LlmModel {
  readonly id: string;
  readonly ownedBy?: string;
}

export interface PromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly contentType?: string | null;
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

export interface LlmConfig {
  readonly id?: number;
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

export type CreatePromptTemplateBody = Omit<
  PromptTemplate,
  'id' | 'createdAt' | 'updatedAt'
>;

export type UpdatePromptTemplateBody = Partial<CreatePromptTemplateBody>;

export type UpdateLlmConfigBody = Partial<Omit<LlmConfig, 'id' | 'updatedAt'>>;

/**
 * Single source of truth for keyword-matching activation.
 * Tramo 2 (todo 9): served by feed-publisher
 * (`GET/PATCH /feed-api/feed-publisher/matching/config`,
 * `:3040` dev / `:3041` staging / `:3042` prod). The scheduler reads
 * this exact row; the frontend MatchingToggleButton is the only writer.
 */
export interface MatchingConfig {
  readonly id: number;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export type UpdateMatchingConfigBody = Partial<Pick<MatchingConfig, 'enabled'>>;

/**
 * Composed 3-flag view (Tramo 2, todo 9):
 * GET /feed-api/api/llm/flags on feed-publisher. `matching` is owned by
 * MatchingConfig; `llm` + `publishing` by LlmConfig. `llmActive` is true
 * only when llm AND publishing are on (C-FLAGS-01); `mode` is the
 * truth-table label (all-paused | drain-raw | drain-llm |
 * enqueue-only | raw-pipeline | full-pipeline).
 */
export interface PipelineFlagsView {
  readonly flags: {
    readonly matching: boolean;
    readonly llm: boolean;
    readonly publishing: boolean;
  };
  readonly llmActive: boolean;
  readonly mode: string;
}

/**
 * Frozen 6-field health contract for the keyword-matching scheduler,
 * served by GET /feed-api/feed-publisher/matching/health. Mirrors the
 * MatchingHealth DTO verbatim — do not extend without a backend change.
 */
export interface MatchingHealth {
  readonly enabled: boolean;
  readonly lastTickAt: string | null;
  readonly lastFetchOk: boolean | null;
  readonly consecutiveFetchFailures: number;
  readonly lastEnqueuedAt: string | null;
  readonly queuePending: number;
}

export const matchingHealthKeys = {
  all: ['crypto-news', 'matching', 'health'] as const,
  health: () => [...matchingHealthKeys.all] as const,
};

export async function fetchMatchingHealth(): Promise<MatchingHealth> {
  return httpGet<MatchingHealth>(ENDPOINTS.feedPublisher.matching.health());
}

export const matchingConfigKeys = {
  all: ['crypto-news', 'matching'] as const,
  config: () => [...matchingConfigKeys.all, 'config'] as const,
};

export async function fetchMatchingConfig(): Promise<MatchingConfig> {
  return httpGet<MatchingConfig>(ENDPOINTS.feedPublisher.matching.config());
}

export async function updateMatchingConfig(
  body: UpdateMatchingConfigBody,
): Promise<MatchingConfig> {
  return httpPatch<UpdateMatchingConfigBody, MatchingConfig>(
    ENDPOINTS.feedPublisher.matching.config(),
    body,
  );
}

export const pipelineFlagsKeys = {
  all: ['feed-publisher', 'llm', 'flags'] as const,
  flags: () => [...pipelineFlagsKeys.all] as const,
};

export async function fetchPipelineFlags(): Promise<PipelineFlagsView> {
  return httpGet<PipelineFlagsView>(ENDPOINTS.feedPublisher.llm.flags());
}

export const llmConfigKeys = {
  all: ['feed-publisher', 'llm'] as const,
  models: () => [...llmConfigKeys.all, 'models'] as const,
  config: () => [...llmConfigKeys.all, 'config'] as const,
  templates: () => [...llmConfigKeys.all, 'templates'] as const,
  template: (id: string) => [...llmConfigKeys.all, 'templates', id] as const,
};

export async function fetchLlmModels(): Promise<ReadonlyArray<LlmModel>> {
  return httpGet<ReadonlyArray<LlmModel>>(ENDPOINTS.feedPublisher.llm.models());
}

export async function fetchLlmConfig(): Promise<LlmConfig> {
  return httpGet<LlmConfig>(ENDPOINTS.feedPublisher.llm.config());
}

export async function updateLlmConfig(
  body: UpdateLlmConfigBody,
): Promise<LlmConfig> {
  return httpPatch<UpdateLlmConfigBody, LlmConfig>(
    ENDPOINTS.feedPublisher.llm.config(),
    body,
  );
}

export async function fetchTemplates(): Promise<ReadonlyArray<PromptTemplate>> {
  return httpGet<ReadonlyArray<PromptTemplate>>(
    ENDPOINTS.feedPublisher.llm.templates(),
  );
}

export async function fetchTemplate(id: string): Promise<PromptTemplate> {
  return httpGet<PromptTemplate>(ENDPOINTS.feedPublisher.llm.template(id));
}

export async function createTemplate(
  body: CreatePromptTemplateBody,
): Promise<PromptTemplate> {
  return httpPost<CreatePromptTemplateBody, PromptTemplate>(
    ENDPOINTS.feedPublisher.llm.templates(),
    body,
  );
}

export async function updateTemplate(
  id: string,
  body: UpdatePromptTemplateBody,
): Promise<PromptTemplate> {
  return httpPatch<UpdatePromptTemplateBody, PromptTemplate>(
    ENDPOINTS.feedPublisher.llm.template(id),
    body,
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  await httpDelete<void>(ENDPOINTS.feedPublisher.llm.template(id));
}

export async function toggleMatchingEnabled(
  enabled: boolean,
): Promise<MatchingConfig> {
  return updateMatchingConfig({ enabled });
}

export async function toggleLlmEnabled(enabled: boolean): Promise<LlmConfig> {
  return updateLlmConfig({ llmEnabled: enabled });
}

export async function togglePublishingEnabled(
  enabled: boolean,
): Promise<LlmConfig> {
  return updateLlmConfig({ publishingEnabled: enabled });
}
