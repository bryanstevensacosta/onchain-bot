import { httpPost } from '@/shared/api';
import { ENDPOINTS } from '@/shared/api/endpoints';

export interface ExtractionResultView {
  id: string;
  kolId: string;
  messageId: number;
  occurredAt: string;
  rawText: string;
  contractAddresses: ReadonlyArray<{
    value: string;
    chainHint: string;
  }>;
  tickers: ReadonlyArray<string>;
  urls: ReadonlyArray<{ value: string; scheme: string }>;
}

export interface ReplayInput {
  kolId: string;
  messageId: number;
  occurredAt: string;
  text: string;
}

/**
 * Note: the backend `extract.input.ts` still uses `channelId` as the
 * JSON field name (Fase 4 renamed the backend entity but did not rename
 * the HTTP DTO field for backward compat). We map `kolId` → `channelId`
 * at the wire boundary here.
 */
export async function replayMessage(
  input: ReplayInput,
): Promise<ExtractionResultView> {
  return httpPost<
    { channelId: string; messageId: number; occurredAt: string; text: string },
    ExtractionResultView
  >(ENDPOINTS.extraction.extract, {
    channelId: input.kolId,
    messageId: input.messageId,
    occurredAt: input.occurredAt,
    text: input.text,
  });
}
