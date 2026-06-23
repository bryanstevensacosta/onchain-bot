import { httpPost } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';

export interface BackfillInput {
  kolId: string;
  limit: number;
}

export interface BackfillResult {
  ingested: number;
  total: number;
}

export async function triggerBackfill(
  input: BackfillInput,
): Promise<BackfillResult> {
  return httpPost<{ limit: number }, BackfillResult>(
    ENDPOINTS.kols.backfill(input.kolId),
    { limit: input.limit },
  );
}
