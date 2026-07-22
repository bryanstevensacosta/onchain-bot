import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBlacklist,
  createBlacklistBatch,
  deleteBlacklist,
  fetchBlacklist,
  blacklistKeys,
  updateBlacklist,
  type CreateBlacklistBatchBody,
  type CreateBlacklistBody,
  type BlacklistPhraseView,
  type UpdateBlacklistBody,
} from '@/features/crypto-news-publisher/api/blacklist-api';

/**
 * Auto-refresh the blacklist phrases list every 10 seconds so toggles/edits in
 * other tabs (or backend-side seeding) surface without a manual reload.
 */
export function useBlacklist() {
  return useQuery<ReadonlyArray<BlacklistPhraseView>>({
    queryKey: blacklistKeys.list(),
    queryFn: fetchBlacklist,
    refetchInterval: 10_000,
  });
}

export function useCreateBlacklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBlacklistBody) => createBlacklist(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: blacklistKeys.all }),
  });
}

export function useCreateBlacklistBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBlacklistBatchBody) => createBlacklistBatch(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: blacklistKeys.all }),
  });
}

export function useUpdateBlacklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateBlacklistBody }) =>
      updateBlacklist(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: blacklistKeys.all }),
  });
}

export function useDeleteBlacklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBlacklist(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: blacklistKeys.all }),
  });
}
