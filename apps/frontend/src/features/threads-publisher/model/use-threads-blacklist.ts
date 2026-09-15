import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createThreadsBlacklist,
  createThreadsBlacklistBatch,
  deleteThreadsBlacklist,
  fetchThreadsBlacklist,
  threadsBlacklistKeys,
  updateThreadsBlacklist,
  type CreateThreadsBlacklistBatchBody,
  type CreateThreadsBlacklistBody,
  type ThreadsBlacklistPhraseView,
  type UpdateThreadsBlacklistBody,
} from '@/features/threads-publisher/api/blacklist-api';

/**
 * Threads blacklist phrases list — auto-refreshes every 10s so
 * toggles/edits in other tabs (or backend-side seeding) surface without
 * a manual reload.
 */
export function useThreadsBlacklist(): {
  data: ReadonlyArray<ThreadsBlacklistPhraseView> | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery<
    ReadonlyArray<ThreadsBlacklistPhraseView>
  >({
    queryKey: threadsBlacklistKeys.list(),
    queryFn: fetchThreadsBlacklist,
    refetchInterval: 10_000,
  });
  return { data, isLoading, error };
}

export function useCreateThreadsBlacklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateThreadsBlacklistBody) =>
      createThreadsBlacklist(body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: threadsBlacklistKeys.all }),
  });
}

export function useCreateThreadsBlacklistBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateThreadsBlacklistBatchBody) =>
      createThreadsBlacklistBatch(body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: threadsBlacklistKeys.all }),
  });
}

export function useUpdateThreadsBlacklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateThreadsBlacklistBody;
    }) => updateThreadsBlacklist(id, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: threadsBlacklistKeys.all }),
  });
}

export function useDeleteThreadsBlacklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteThreadsBlacklist(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: threadsBlacklistKeys.all }),
  });
}
