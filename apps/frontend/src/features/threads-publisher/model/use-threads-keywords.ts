import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createThreadsKeyword,
  createThreadsKeywordBatch,
  deleteThreadsKeyword,
  fetchThreadsKeywords,
  threadsKeywordsKeys,
  updateThreadsKeyword,
  type CreateThreadsKeywordBatchBody,
  type CreateThreadsKeywordBody,
  type ThreadsKeywordView,
  type UpdateThreadsKeywordBody,
} from '@/features/threads-publisher/api/keywords-api';

/**
 * Threads keywords list — auto-refreshes every 10s so toggles/edits in
 * other tabs (or backend-side seeding) surface without a manual reload.
 */
export function useThreadsKeywords(): {
  data: ReadonlyArray<ThreadsKeywordView> | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery<
    ReadonlyArray<ThreadsKeywordView>
  >({
    queryKey: threadsKeywordsKeys.list(),
    queryFn: fetchThreadsKeywords,
    refetchInterval: 10_000,
  });
  return { data, isLoading, error };
}

export function useCreateThreadsKeyword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateThreadsKeywordBody) => createThreadsKeyword(body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: threadsKeywordsKeys.all }),
  });
}

export function useUpdateThreadsKeyword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateThreadsKeywordBody;
    }) => updateThreadsKeyword(id, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: threadsKeywordsKeys.all }),
  });
}

export function useCreateThreadsKeywordBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateThreadsKeywordBatchBody) =>
      createThreadsKeywordBatch(body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: threadsKeywordsKeys.all }),
  });
}

export function useDeleteThreadsKeyword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteThreadsKeyword(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: threadsKeywordsKeys.all }),
  });
}
