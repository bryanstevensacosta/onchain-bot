import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchKolRankings,
  fetchKolSources,
  fetchTemplate,
  fetchTemplateCalls,
  fetchTemplates,
  templateKeys,
  updateTemplateSources,
} from '../api/template-queries';
import type { RankingWindow, RankingsSort } from './types';

export function useTemplates() {
  return useQuery({
    queryKey: templateKeys.templates(),
    queryFn: fetchTemplates,
    refetchInterval: 30_000,
  });
}

export function useTemplateDetail(id: string | undefined) {
  return useQuery({
    queryKey: templateKeys.detail(id ?? ''),
    queryFn: () => fetchTemplate(id!),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}

export function useTemplateCalls(templateId: string | undefined) {
  return useQuery({
    queryKey: templateKeys.calls(templateId ?? ''),
    queryFn: () => fetchTemplateCalls(templateId!),
    enabled: !!templateId,
    refetchInterval: 10_000,
  });
}

export function useKolSources() {
  return useQuery({
    queryKey: templateKeys.sources(),
    queryFn: fetchKolSources,
    refetchInterval: 30_000,
  });
}

export function useKolRankings(window: RankingWindow, sort: RankingsSort) {
  return useQuery({
    queryKey: templateKeys.kolRankings(window, sort),
    queryFn: () => fetchKolRankings(window, sort),
    refetchInterval: 15_000,
  });
}

export function useUpdateTemplateSources(templateId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (kolSourceIds: ReadonlyArray<string>) =>
      updateTemplateSources(templateId, kolSourceIds),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: templateKeys.detail(templateId),
      });
      void client.invalidateQueries({
        queryKey: templateKeys.calls(templateId),
      });
      void client.invalidateQueries({ queryKey: templateKeys.templates() });
    },
  });
}
