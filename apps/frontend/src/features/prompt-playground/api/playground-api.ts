import { httpPost } from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type { ReasoningEffort } from '@/features/feed-publisher/api/llm-config-api';

/**
 * Prompt-playground views. Mirror the backend preview DTOs verbatim —
 * do not extend without a backend change.
 *
 * Contract (Tramo 2, todo 9 — feed-publisher):
 *   POST /feed-api/api/llm/preview
 *   body:    { templateId?, draft?, rawTitle?, rawContent, hasImage?, generate? }
 *   response:{ renderedUserPrompt, systemPrompt, model, maxTokens,
 *              temperature, reasoningEffort, content }
 *
 * `content` is only populated when `generate=true` (one LLM call per run).
 */
export interface PlaygroundDraft {
  readonly systemPromptText: string;
  readonly promptText: string;
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly reasoningEffort: ReasoningEffort;
  readonly supportsVision: boolean;
}

export interface PreviewPlaygroundBody {
  readonly templateId?: string;
  readonly draft?: PlaygroundDraft;
  readonly rawTitle?: string;
  readonly rawContent: string;
  readonly hasImage?: boolean;
  readonly generate?: boolean;
}

export interface PreviewPlaygroundResult {
  readonly renderedUserPrompt: string;
  readonly systemPrompt: string;
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly reasoningEffort: ReasoningEffort;
  readonly content: string | null;
}

export const playgroundKeys = {
  all: ['feed-publisher', 'llm', 'playground'] as const,
  preview: () => [...playgroundKeys.all, 'preview'] as const,
};

export async function previewPrompt(
  body: PreviewPlaygroundBody,
): Promise<PreviewPlaygroundResult> {
  return httpPost<PreviewPlaygroundBody, PreviewPlaygroundResult>(
    ENDPOINTS.feedPublisher.llm.preview(),
    body,
  );
}
