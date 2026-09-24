/**
 * Minimal source view needed to render queue entries.
 *
 * Satisfied by `CryptoNewsSourceDto` (HTTP, ingestion-telegram owner) — the
 * deprecated `CryptoNewsSourceRepository` in-memory shim returned an empty
 * store, so this controller now fetches sources live via
 * GET `{ingestionBaseUrl}/api/feed/sources` (Opción A, T7).
 */
export interface QueueSourceView {
  readonly channelId: string;
  readonly handle: string | null;
  readonly title: string;
}

export interface QueueEntryView {
  readonly id: string;
  readonly traceId: string;
  readonly channelId: string;
  readonly sourceHandle: string | null;
  readonly sourceTitle: string | null;
  readonly messageId: number;
  readonly rawTitle: string | null;
  readonly rawContent: string | null;
  readonly imagePath: string | null;
  readonly imagePaths: string[];
  readonly groupedId: string | null;
  readonly matchedKeywordIds: string[];
  readonly status: string;
  readonly messageReceivedAt: string;
  readonly publishedAt: string | null;
  readonly telegramMessageId: string | null;
  readonly telegramUrl: string | null;
  readonly lastError: string | null;
  readonly attempts: number;
  readonly generatedContent: string | null;
  readonly generatedSystemPrompt: string | null;
  readonly generatedUserPrompt: string | null;
  readonly generatedTemperature: number | null;
  readonly generatedReasoningEffort: string | null;
  readonly generatedModel: string | null;
  readonly blockedReason: string | null;
  readonly duplicateOfChannelId: string | null;
  readonly duplicateOfMessageId: number | null;
  readonly duplicateOfEntryId: string | null;
  readonly duplicateOfSourceHandle: string | null;
  readonly duplicateOfTelegramUrl: string | null;
  readonly displayName: string;
}

export interface QueueCountsView {
  readonly pending: number;
  readonly publishedToday: number;
  readonly dailyCap: number;
  readonly remaining: number;
}
