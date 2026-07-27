import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkConflict,
  fetchPhrases,
  phrasesKeys,
  searchPhrases,
  type MatchMode,
  type PhraseEntry,
} from '@/features/crypto-news-publisher/api/phrases-api';

/**
 * Auto-refresh the phrases list every 10 seconds so toggles/edits in
 * other tabs (or backend-side seeding) surface without a manual reload.
 */
export function usePhrases() {
  return useQuery<ReadonlyArray<PhraseEntry>>({
    queryKey: phrasesKeys.list(),
    queryFn: fetchPhrases,
    refetchInterval: 10_000,
  });
}

export function useSearchPhrases(q: string, table?: 'keyword' | 'blacklist') {
  return useQuery<ReadonlyArray<PhraseEntry>>({
    queryKey: phrasesKeys.search(q, table),
    queryFn: () => searchPhrases(q, table),
    enabled: q.trim().length > 0,
  });
}

export function useCheckConflict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      phrase,
      caseSensitive,
      matchMode,
    }: {
      phrase: string;
      caseSensitive?: boolean;
      matchMode?: MatchMode;
    }) => checkConflict(phrase, caseSensitive, matchMode),
    onSuccess: () => {
      // Invalidate phrases list in case this was a new phrase
      qc.invalidateQueries({ queryKey: phrasesKeys.all });
    },
  });
}
