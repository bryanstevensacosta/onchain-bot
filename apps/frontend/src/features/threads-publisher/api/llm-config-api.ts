import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';
import { threadsMatchingKeys, threadsPublisherKeys } from '@/entities/threads';

export type ThreadsReasoningEffort = 'low' | 'medium' | 'high' | 'max' | null;

export interface ThreadsLlmModel {
  readonly id: string;
  readonly ownedBy?: string;
}

/**
 * Threads prompt template view — frontend mirror of the backend
 * `ThreadsPromptTemplateView` (threads llm-config mapper). No Telegram
 * formatting fields: Threads output is plain text (<500 chars).
 */
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

/**
 * Threads LLM config view — frontend mirror of the backend
 * `ThreadsLlmConfigView`. Deliberately WITHOUT `targetChannel` and
 * WITHOUT legacy `matchingEnabled` (matching truth lives only in
 * `threads_matching_configs`, served under `/threads/matching/*`).
 */
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

export type CreateThreadsPromptTemplateBody = Omit<
  ThreadsPromptTemplateView,
  'id' | 'createdAt' | 'updatedAt'
>;

export type UpdateThreadsPromptTemplateBody =
  Partial<CreateThreadsPromptTemplateBody>;

export type UpdateThreadsLlmConfigBody = Partial<
  Omit<ThreadsLlmConfigView, 'id' | 'updatedAt'>
>;

/**
 * Single source of truth for threads keyword-matching activation:
 * threads_matching_configs (id=1), served by
 * GET/PATCH /threads/matching/config. The scheduler and SSE handler
 * read this exact row; the threads toggle is the only writer.
 */
export interface ThreadsMatchingConfig {
  readonly id: number;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export type UpdateThreadsMatchingConfigBody = Partial<
  Pick<ThreadsMatchingConfig, 'enabled'>
>;

/**
 * Frozen 6-field health contract for the threads keyword-matching
 * scheduler, served by GET /threads/matching/health. Mirrors the backend
 * ThreadsMatchingHealthView verbatim — do not extend without a backend
 * change.
 */
export interface ThreadsMatchingHealth {
  readonly enabled: boolean;
  readonly lastTickAt: string | null;
  readonly lastFetchOk: boolean | null;
  readonly consecutiveFetchFailures: number;
  readonly lastEnqueuedAt: string | null;
  readonly queuePending: number;
}

export const threadsMatchingHealthKeys = {
  all: [...threadsMatchingKeys.all, 'health'] as const,
  health: () => [...threadsMatchingHealthKeys.all] as const,
};

export async function fetchThreadsMatchingHealth(): Promise<ThreadsMatchingHealth> {
  return httpGet<ThreadsMatchingHealth>('/threads/matching/health');
}

export const threadsMatchingConfigKeys = {
  all: [...threadsMatchingKeys.all, 'config'] as const,
  config: () => [...threadsMatchingConfigKeys.all] as const,
};

export async function fetchThreadsMatchingConfig(): Promise<ThreadsMatchingConfig> {
  return httpGet<ThreadsMatchingConfig>('/threads/matching/config');
}

export async function updateThreadsMatchingConfig(
  body: UpdateThreadsMatchingConfigBody,
): Promise<ThreadsMatchingConfig> {
  return httpPatch<UpdateThreadsMatchingConfigBody, ThreadsMatchingConfig>(
    '/threads/matching/config',
    body,
  );
}

export const threadsLlmConfigKeys = {
  all: [...threadsPublisherKeys.all, 'llm'] as const,
  models: () => [...threadsLlmConfigKeys.all, 'models'] as const,
  config: () => [...threadsLlmConfigKeys.all, 'config'] as const,
  templates: () => [...threadsLlmConfigKeys.all, 'templates'] as const,
  template: (id: string) =>
    [...threadsLlmConfigKeys.all, 'templates', id] as const,
};

export async function fetchThreadsLlmModels(): Promise<
  ReadonlyArray<ThreadsLlmModel>
> {
  return httpGet<ReadonlyArray<ThreadsLlmModel>>(
    '/threads-publisher/llm/models',
  );
}

export async function fetchThreadsLlmConfig(): Promise<ThreadsLlmConfigView> {
  return httpGet<ThreadsLlmConfigView>('/threads-publisher/llm/config');
}

export async function updateThreadsLlmConfig(
  body: UpdateThreadsLlmConfigBody,
): Promise<ThreadsLlmConfigView> {
  return httpPatch<UpdateThreadsLlmConfigBody, ThreadsLlmConfigView>(
    '/threads-publisher/llm/config',
    body,
  );
}

export async function fetchThreadsTemplates(): Promise<
  ReadonlyArray<ThreadsPromptTemplateView>
> {
  return httpGet<ReadonlyArray<ThreadsPromptTemplateView>>(
    '/threads-publisher/llm/templates',
  );
}

export async function fetchThreadsTemplate(
  id: string,
): Promise<ThreadsPromptTemplateView> {
  return httpGet<ThreadsPromptTemplateView>(
    `/threads-publisher/llm/templates/${encodeURIComponent(id)}`,
  );
}

export async function createThreadsTemplate(
  body: CreateThreadsPromptTemplateBody,
): Promise<ThreadsPromptTemplateView> {
  return httpPost<CreateThreadsPromptTemplateBody, ThreadsPromptTemplateView>(
    '/threads-publisher/llm/templates',
    body,
  );
}

export async function updateThreadsTemplate(
  id: string,
  body: UpdateThreadsPromptTemplateBody,
): Promise<ThreadsPromptTemplateView> {
  return httpPatch<UpdateThreadsPromptTemplateBody, ThreadsPromptTemplateView>(
    `/threads-publisher/llm/templates/${encodeURIComponent(id)}`,
    body,
  );
}

export async function deleteThreadsTemplate(id: string): Promise<void> {
  await httpDelete<void>(
    `/threads-publisher/llm/templates/${encodeURIComponent(id)}`,
  );
}

export async function toggleThreadsMatchingEnabled(
  enabled: boolean,
): Promise<ThreadsMatchingConfig> {
  return updateThreadsMatchingConfig({ enabled });
}

export async function toggleThreadsLlmEnabled(
  enabled: boolean,
): Promise<ThreadsLlmConfigView> {
  return updateThreadsLlmConfig({ llmEnabled: enabled });
}

export async function toggleThreadsPublishingEnabled(
  enabled: boolean,
): Promise<ThreadsLlmConfigView> {
  return updateThreadsLlmConfig({ publishingEnabled: enabled });
}
