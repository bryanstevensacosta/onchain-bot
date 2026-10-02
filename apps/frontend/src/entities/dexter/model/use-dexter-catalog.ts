import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateDisplayMapBody, UpdateDisplayMapBody } from './types';
import {
  createDisplayMap,
  deleteDisplayMap,
  dexterKeys,
  fetchDisplayMaps,
  fetchPlaceholders,
  updateDisplayMap,
} from '../api/dexter-queries';

export function usePlaceholders(command: string) {
  return useQuery({
    queryKey: dexterKeys.placeholders(command),
    queryFn: () => fetchPlaceholders(command),
    enabled: !!command,
    refetchInterval: 30_000,
  });
}

export function useDisplayMaps(placeholderKey?: string) {
  const key =
    placeholderKey !== undefined && placeholderKey !== ''
      ? ([...dexterKeys.displayMaps, { placeholderKey }] as const)
      : dexterKeys.displayMaps;
  return useQuery({
    queryKey: key,
    queryFn: () => fetchDisplayMaps(placeholderKey),
    refetchInterval: 10_000,
  });
}

function useInvalidateDisplayMaps() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: dexterKeys.displayMaps });
  };
}

export function useCreateDisplayMap() {
  const invalidate = useInvalidateDisplayMaps();
  return useMutation({
    mutationFn: (body: CreateDisplayMapBody) => createDisplayMap(body),
    onSuccess: invalidate,
  });
}

export function useUpdateDisplayMap() {
  const invalidate = useInvalidateDisplayMaps();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDisplayMapBody }) =>
      updateDisplayMap(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteDisplayMap() {
  const invalidate = useInvalidateDisplayMaps();
  return useMutation({
    mutationFn: (id: string) => deleteDisplayMap(id),
    onSuccess: invalidate,
  });
}
