import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkThreadsConflict,
  fetchThreadsPhrases,
  searchThreadsPhrases,
  threadsPhrasesKeys,
  type ThreadsMatchMode,
  type ThreadsPhraseEntry,
} from '@/features/threads-publisher/api/phrases-api';

/**
 * Threads phrases list (keywords + blacklist union) — auto-refreshes
 * every 10s so edits in other tabs surface without a manual reload.
 */
export function useThreadsPhrases(): {
  data: ReadonlyArray<ThreadsPhraseEntry> | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery<
    ReadonlyArray<ThreadsPhraseEntry>
  >({
    queryKey: threadsPhrasesKeys.list(),
    queryFn: fetchThreadsPhrases,
    refetchInterval: 10_000,
  });
  return { data, isLoading, error };
}

export function useSearchThreadsPhrases(
  q: string,
  table?: 'keyword' | 'blacklist',
): {
  data: ReadonlyArray<ThreadsPhraseEntry> | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery<
    ReadonlyArray<ThreadsPhraseEntry>
  >({
    queryKey: threadsPhrasesKeys.search(q, table),
    queryFn: () => searchThreadsPhrases(q, table),
    enabled: q.trim().length > 0,
  });
  return { data, isLoading, error };
}

export function useCheckThreadsConflict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      phrase,
      caseSensitive,
      matchMode,
    }: {
      phrase: string;
      caseSensitive?: boolean;
      matchMode?: ThreadsMatchMode;
    }) => checkThreadsConflict(phrase, caseSensitive, matchMode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: threadsPhrasesKeys.all });
    },
  });
}
