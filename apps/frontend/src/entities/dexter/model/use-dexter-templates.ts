import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateMessageTemplateBody,
  UpdateMessageTemplateBody,
} from './types';
import {
  activateDexterTemplate,
  createDexterTemplate,
  deleteDexterTemplate,
  dexterKeys,
  fetchDexterTemplate,
  fetchDexterTemplates,
  updateDexterTemplate,
} from '../api/dexter-queries';

export function useDexterTemplates(command?: string) {
  const key =
    command !== undefined && command !== ''
      ? ([...dexterKeys.templates, { command }] as const)
      : dexterKeys.templates;
  return useQuery({
    queryKey: key,
    queryFn: () => fetchDexterTemplates(command),
    refetchInterval: 10_000,
  });
}

export function useDexterTemplate(id: string) {
  return useQuery({
    queryKey: dexterKeys.template(id),
    queryFn: () => fetchDexterTemplate(id),
    enabled: !!id,
  });
}

function useInvalidateDexterTemplates() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: dexterKeys.templates });
  };
}

export function useCreateTemplate() {
  const invalidate = useInvalidateDexterTemplates();
  return useMutation({
    mutationFn: (body: CreateMessageTemplateBody) => createDexterTemplate(body),
    onSuccess: invalidate,
  });
}

export function useUpdateTemplate() {
  const client = useQueryClient();
  const invalidate = useInvalidateDexterTemplates();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateMessageTemplateBody;
    }) => updateDexterTemplate(id, body),
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({
        queryKey: dexterKeys.template(variables.id),
      });
      invalidate();
    },
  });
}

export function useDeleteTemplate() {
  const client = useQueryClient();
  const invalidate = useInvalidateDexterTemplates();
  return useMutation({
    mutationFn: (id: string) => deleteDexterTemplate(id),
    onSuccess: (_data, id) => {
      void client.invalidateQueries({ queryKey: dexterKeys.template(id) });
      invalidate();
    },
  });
}

export function useActivateTemplate() {
  const client = useQueryClient();
  const invalidate = useInvalidateDexterTemplates();
  return useMutation({
    mutationFn: (id: string) => activateDexterTemplate(id),
    onSuccess: (_data, id) => {
      void client.invalidateQueries({ queryKey: dexterKeys.template(id) });
      invalidate();
    },
  });
}
