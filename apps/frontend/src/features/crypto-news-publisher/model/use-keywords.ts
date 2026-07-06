import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createKeyword,
  deleteKeyword,
  fetchKeywords,
  keywordsKeys,
  updateKeyword,
  type CreateKeywordBody,
  type KeywordView,
  type UpdateKeywordBody,
} from '@/features/crypto-news-publisher/api/keywords-api';

/**
 * Auto-refresh the keywords list every 10 seconds so toggles/edits in
 * other tabs (or backend-side seeding) surface without a manual reload.
 */
export function useKeywords() {
  return useQuery<ReadonlyArray<KeywordView>>({
    queryKey: keywordsKeys.list(),
    queryFn: fetchKeywords,
    refetchInterval: 10_000,
  });
}

export function useCreateKeyword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateKeywordBody) => createKeyword(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keywordsKeys.all }),
  });
}

export function useUpdateKeyword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateKeywordBody }) =>
      updateKeyword(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keywordsKeys.all }),
  });
}

export function useDeleteKeyword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteKeyword(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keywordsKeys.all }),
  });
}
