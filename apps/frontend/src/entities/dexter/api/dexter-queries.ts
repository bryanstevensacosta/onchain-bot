import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';
import { ENDPOINTS } from '@/shared/api/endpoints';
import type {
  CreateDisplayMapBody,
  CreateMessageTemplateBody,
  DisplayMapView,
  MessageTemplateView,
  PlaceholdersView,
  PreviewTemplateBody,
  PreviewTemplateOutput,
  UpdateDisplayMapBody,
  UpdateMessageTemplateBody,
} from '../model/types';

/**
 * Dexter template-management views (Wave 1 Lane A).
 *
 * Contracts mirrored verbatim from
 * `apps/dexter-onchain-bot/src/templates/api/http/`:
 * `message-templates.controller.ts` (list/create/400+valid/patch/409s/
 * activate/404s), `template-preview.controller.ts` (XOR rule, timeframe
 * validation), `placeholders.controller.ts`, `display-maps.controller.ts`.
 * All paths go through the same-origin `/dexter-api` prefix (vite dev
 * proxies it to `:4060`; nginx locations are Lane C).
 */

export const dexterKeys = {
  all: ['dexter'] as const,
  templates: ['dexter', 'templates'] as const,
  template: (id: string) => ['dexter', 'template', id] as const,
  placeholders: (command: string) =>
    ['dexter', 'placeholders', command] as const,
  displayMaps: ['dexter', 'display-maps'] as const,
};

export async function fetchDexterTemplates(
  command?: string,
): Promise<ReadonlyArray<MessageTemplateView>> {
  const base = ENDPOINTS.dexter.templates;
  const url =
    command !== undefined && command !== ''
      ? `${base}?command=${encodeURIComponent(command)}`
      : base;
  return httpGet<ReadonlyArray<MessageTemplateView>>(url);
}

export async function fetchDexterTemplate(
  id: string,
): Promise<MessageTemplateView> {
  return httpGet<MessageTemplateView>(ENDPOINTS.dexter.templateById(id));
}

export async function createDexterTemplate(
  body: CreateMessageTemplateBody,
): Promise<MessageTemplateView> {
  return httpPost<CreateMessageTemplateBody, MessageTemplateView>(
    ENDPOINTS.dexter.templates,
    body,
  );
}

export async function updateDexterTemplate(
  id: string,
  body: UpdateMessageTemplateBody,
): Promise<MessageTemplateView> {
  return httpPatch<UpdateMessageTemplateBody, MessageTemplateView>(
    ENDPOINTS.dexter.templateById(id),
    body,
  );
}

export async function deleteDexterTemplate(id: string): Promise<void> {
  await httpDelete<void>(ENDPOINTS.dexter.templateById(id));
}

export async function activateDexterTemplate(
  id: string,
): Promise<MessageTemplateView> {
  return httpPost<Record<string, never>, MessageTemplateView>(
    ENDPOINTS.dexter.templateActivate(id),
    {},
  );
}

export async function previewDexterTemplate(
  body: PreviewTemplateBody,
  signal?: AbortSignal,
): Promise<PreviewTemplateOutput> {
  return httpPost<PreviewTemplateBody, PreviewTemplateOutput>(
    ENDPOINTS.dexter.templatePreview,
    body,
    signal,
  );
}

export async function fetchPlaceholders(
  command: string,
): Promise<PlaceholdersView> {
  return httpGet<PlaceholdersView>(
    ENDPOINTS.dexter.placeholdersByCommand(command),
  );
}

export async function fetchDisplayMaps(
  placeholderKey?: string,
): Promise<ReadonlyArray<DisplayMapView>> {
  const base = ENDPOINTS.dexter.displayMaps;
  const url =
    placeholderKey !== undefined && placeholderKey !== ''
      ? `${base}?placeholderKey=${encodeURIComponent(placeholderKey)}`
      : base;
  return httpGet<ReadonlyArray<DisplayMapView>>(url);
}

export async function createDisplayMap(
  body: CreateDisplayMapBody,
): Promise<DisplayMapView> {
  return httpPost<CreateDisplayMapBody, DisplayMapView>(
    ENDPOINTS.dexter.displayMaps,
    body,
  );
}

export async function updateDisplayMap(
  id: string,
  body: UpdateDisplayMapBody,
): Promise<DisplayMapView> {
  return httpPatch<UpdateDisplayMapBody, DisplayMapView>(
    ENDPOINTS.dexter.displayMapById(id),
    body,
  );
}

export async function deleteDisplayMap(id: string): Promise<void> {
  await httpDelete<void>(ENDPOINTS.dexter.displayMapById(id));
}
