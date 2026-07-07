import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTemplate,
  deleteTemplate,
  fetchLlmConfig,
  fetchLlmModels,
  fetchTemplate,
  fetchTemplates,
  llmConfigKeys,
  updateLlmConfig,
  updateTemplate,
  type CreatePromptTemplateBody,
  type LlmConfig,
  type LlmModel,
  type PromptTemplate,
  type UpdateLlmConfigBody,
  type UpdatePromptTemplateBody,
} from '@/features/crypto-news-publisher/api/llm-config-api';

/**
 * Gateway model list. The model set is effectively static; we cache it
 * for 5 minutes so refreshes of the LLM config form don't re-poll the
 * upstream gateway on every keypress.
 */
export function useLlmModels() {
  return useQuery<ReadonlyArray<LlmModel>>({
    queryKey: llmConfigKeys.models(),
    queryFn: fetchLlmModels,
    staleTime: 5 * 60_000,
  });
}

/**
 * Current LlmConfig (single-row publishing knobs + default template
 * binding). 5s staleness keeps the form in lock-step with operator
 * edits in another tab.
 */
export function useLlmConfig() {
  return useQuery<LlmConfig>({
    queryKey: llmConfigKeys.config(),
    queryFn: fetchLlmConfig,
    staleTime: 5_000,
  });
}

export function useUpdateLlmConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateLlmConfigBody) => updateLlmConfig(patch),
    onSuccess: (saved) => {
      qc.setQueryData(llmConfigKeys.config(), saved);
      qc.invalidateQueries({ queryKey: llmConfigKeys.config() });
    },
  });
}

/**
 * All prompt templates. Templates change rarely (CRUD-only, no
 * per-second telemetry) — 30s staleness is plenty.
 */
export function useTemplates() {
  return useQuery<ReadonlyArray<PromptTemplate>>({
    queryKey: llmConfigKeys.templates(),
    queryFn: fetchTemplates,
    staleTime: 30_000,
  });
}

export function useTemplate(id: string | null) {
  return useQuery<PromptTemplate>({
    queryKey: id
      ? llmConfigKeys.template(id)
      : [...llmConfigKeys.all, 'templates', 'none'],
    queryFn: () => {
      if (!id) {
        throw new Error('useTemplate called without an id');
      }
      return fetchTemplate(id);
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePromptTemplateBody) => createTemplate(body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: llmConfigKeys.templates() }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdatePromptTemplateBody;
    }) => updateTemplate(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: llmConfigKeys.templates() });
      qc.invalidateQueries({
        queryKey: [...llmConfigKeys.all, 'templates'],
      });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: llmConfigKeys.templates() });
      qc.invalidateQueries({ queryKey: llmConfigKeys.config() });
    },
  });
}
