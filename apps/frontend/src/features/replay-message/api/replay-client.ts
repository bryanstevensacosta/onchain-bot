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
 * Wire format matches the backend `ExtractInput` DTO (apps/backend/src/token/intake/extraction/api/input/extract.input.ts):
 *   { kolId, messageId, occurredAt, text }
 */
export async function replayMessage(
  input: ReplayInput,
): Promise<ExtractionResultView> {
  return httpPost<
    { kolId: string; messageId: number; occurredAt: string; text: string },
    ExtractionResultView
  >(ENDPOINTS.extraction.extract, {
    kolId: input.kolId,
    messageId: input.messageId,
    occurredAt: input.occurredAt,
    text: input.text,
  });
}
