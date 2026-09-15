import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createThreadsTemplate,
  deleteThreadsTemplate,
  fetchThreadsLlmConfig,
  fetchThreadsLlmModels,
  fetchThreadsMatchingConfig,
  fetchThreadsMatchingHealth,
  fetchThreadsTemplate,
  fetchThreadsTemplates,
  threadsLlmConfigKeys,
  threadsMatchingConfigKeys,
  threadsMatchingHealthKeys,
  toggleThreadsMatchingEnabled,
  updateThreadsLlmConfig,
  updateThreadsTemplate,
  type CreateThreadsPromptTemplateBody,
  type ThreadsLlmConfigView,
  type ThreadsLlmModel,
  type ThreadsMatchingConfig,
  type ThreadsMatchingHealth,
  type ThreadsPromptTemplateView,
  type UpdateThreadsLlmConfigBody,
  type UpdateThreadsPromptTemplateBody,
} from '@/features/threads-publisher/api/llm-config-api';

/**
 * Gateway model list. The model set is effectively static; we cache it
 * for 5 minutes so refreshes of the threads LLM config form don't
 * re-poll the upstream gateway on every keypress.
 */
export function useThreadsLlmModels() {
  return useQuery<ReadonlyArray<ThreadsLlmModel>>({
    queryKey: threadsLlmConfigKeys.models(),
    queryFn: fetchThreadsLlmModels,
    staleTime: 5 * 60_000,
  });
}

/**
 * Current threads LLM config (single-row publishing knobs + default
 * template binding). 5s staleness keeps the form in lock-step with
 * operator edits in another tab.
 */
export function useThreadsLlmConfig(): {
  data: ThreadsLlmConfigView | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<ThreadsLlmConfigView>({
    queryKey: threadsLlmConfigKeys.config(),
    queryFn: fetchThreadsLlmConfig,
    staleTime: 5_000,
  });
  return { data, isLoading };
}

export function useUpdateThreadsLlmConfig(): {
  update: (patch: Partial<ThreadsLlmConfigView>) => void;
  isPending: boolean;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (patch: UpdateThreadsLlmConfigBody) =>
      updateThreadsLlmConfig(patch),
    onSuccess: (saved) => {
      qc.setQueryData(threadsLlmConfigKeys.config(), saved);
      qc.invalidateQueries({ queryKey: threadsLlmConfigKeys.config() });
    },
  });
  return {
    update: (patch: Partial<ThreadsLlmConfigView>) => mutation.mutate(patch),
    isPending: mutation.isPending,
  };
}

/**
 * Single-row threads matching activation (threads_matching_configs id=1).
 * SOLE source of truth read by the scheduler + SSE handler; the threads
 * toggle below is the only writer. 5s staleness keeps Start/Stop in
 * lock-step across tabs.
 */
export function useThreadsMatchingConfig(): {
  data: ThreadsMatchingConfig | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<ThreadsMatchingConfig>({
    queryKey: threadsMatchingConfigKeys.config(),
    queryFn: fetchThreadsMatchingConfig,
    staleTime: 5_000,
  });
  return { data, isLoading };
}

/**
 * Scheduler health tripwire (GET /threads/matching/health).
 * `retry: false` like the mirror: consumers render UNKNOWN on error
 * instead of spinning through retries.
 */
export function useThreadsMatchingHealth(): {
  data: ThreadsMatchingHealth | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery<ThreadsMatchingHealth>({
    queryKey: threadsMatchingHealthKeys.health(),
    queryFn: fetchThreadsMatchingHealth,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
    retry: false,
  });
  return { data, isLoading, error };
}

/**
 * Toggle threads keyword matching enabled/disabled. Writes the SOLE
 * source (PATCH /threads/matching/config) with optimistic update;
 * reverts on error. Reads the current value from the cache so the
 * pinned `toggle: () => void` signature needs no arguments.
 */
export function useToggleThreadsMatching(): {
  toggle: () => void;
  isPending: boolean;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => toggleThreadsMatchingEnabled(enabled),
    onMutate: async (enabled) => {
      await qc.cancelQueries({ queryKey: threadsMatchingConfigKeys.config() });
      const prev = qc.getQueryData<ThreadsMatchingConfig>(
        threadsMatchingConfigKeys.config(),
      );
      if (prev) {
        qc.setQueryData<ThreadsMatchingConfig>(
          threadsMatchingConfigKeys.config(),
          { ...prev, enabled },
        );
      }
      return { prev };
    },
    onError: (_err, _enabled, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(threadsMatchingConfigKeys.config(), ctx.prev);
      }
    },
    onSuccess: (saved) => {
      qc.setQueryData(threadsMatchingConfigKeys.config(), saved);
      qc.invalidateQueries({ queryKey: threadsMatchingConfigKeys.config() });
    },
  });
  return {
    toggle: () => {
      const current = qc.getQueryData<ThreadsMatchingConfig>(
        threadsMatchingConfigKeys.config(),
      );
      mutation.mutate(!(current?.enabled ?? false));
    },
    isPending: mutation.isPending,
  };
}

/**
 * All threads prompt templates. Templates change rarely (CRUD-only, no
 * per-second telemetry) — 30s staleness is plenty.
 */
export function useThreadsTemplates(): {
  data: ReadonlyArray<ThreadsPromptTemplateView> | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery<
    ReadonlyArray<ThreadsPromptTemplateView>
  >({
    queryKey: threadsLlmConfigKeys.templates(),
    queryFn: fetchThreadsTemplates,
    staleTime: 30_000,
  });
  return { data, isLoading };
}

export function useThreadsTemplate(id: string | null) {
  return useQuery<ThreadsPromptTemplateView>({
    queryKey: id
      ? threadsLlmConfigKeys.template(id)
      : [...threadsLlmConfigKeys.all, 'templates', 'none'],
    queryFn: () => {
      if (!id) {
        throw new Error('useThreadsTemplate called without an id');
      }
      return fetchThreadsTemplate(id);
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateThreadsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateThreadsPromptTemplateBody) =>
      createThreadsTemplate(body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: threadsLlmConfigKeys.templates() }),
  });
}

export function useUpdateThreadsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateThreadsPromptTemplateBody;
    }) => updateThreadsTemplate(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: threadsLlmConfigKeys.templates() });
      qc.invalidateQueries({
        queryKey: [...threadsLlmConfigKeys.all, 'templates'],
      });
    },
  });
}

export function useDeleteThreadsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteThreadsTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: threadsLlmConfigKeys.templates() });
      qc.invalidateQueries({ queryKey: threadsLlmConfigKeys.config() });
    },
  });
}
