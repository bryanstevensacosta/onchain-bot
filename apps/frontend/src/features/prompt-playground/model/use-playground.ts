import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  previewPrompt,
  playgroundKeys,
  type PreviewPlaygroundBody,
  type PreviewPlaygroundResult,
} from '@/features/prompt-playground/api/playground-api';

// Template list / models / create-template reuse the canonical
// feed-publisher hooks (same GET/POST endpoints, same cache keys).
export {
  useCreateTemplate,
  useLlmModels,
  useTemplates,
  useUpdateTemplate,
} from '@/features/feed-publisher/model/use-llm-config';

/**
 * Test-run a prompt draft against a real news sample. SIMPLE tier:
 * plain useMutation + invalidate, no optimistic updates (each run is
 * one LLM call — nothing to stage optimistically).
 */
export function usePreviewMutation() {
  const qc = useQueryClient();
  return useMutation<PreviewPlaygroundResult, Error, PreviewPlaygroundBody>({
    mutationFn: (body) => previewPrompt(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: playgroundKeys.all });
    },
  });
}
