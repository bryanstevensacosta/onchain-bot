import { useMutation } from '@tanstack/react-query';
import type { PreviewTemplateBody } from './types';
import { previewDexterTemplate } from '../api/dexter-queries';

/**
 * On-demand template preview (`templateId` XOR `draft` + `address`).
 * Manual fetch via mutation — no polling, no cache: every preview is a
 * fresh dry-run (render-only, never persists, never activates).
 * 400/404 shapes surface through `mutation.error` (`HttpError{status, body}`).
 */
export function usePreviewTemplate() {
  return useMutation({
    mutationFn: (body: PreviewTemplateBody) => previewDexterTemplate(body),
  });
}
