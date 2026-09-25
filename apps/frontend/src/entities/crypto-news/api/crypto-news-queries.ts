import {
  httpGet,
  httpPost,
  httpPatch,
  httpPut,
  httpDelete,
} from '@/shared/api/http-client';

export interface CryptoNewsMediaView {
  readonly id: string;
  readonly index: number;
  readonly type: string;
  readonly url: string;
  readonly mimeType: string | null;
}

export interface CryptoNewsMessage {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly publishedAt: string;
  readonly ingestedAt: string;
  readonly media: ReadonlyArray<CryptoNewsMediaView>;
  readonly linkPreviewUrl: string | null;
  readonly linkPreviewTitle: string | null;
  readonly linkPreviewDescription: string | null;
  readonly linkPreviewSiteName: string | null;
  readonly formattingEntities?: ReadonlyArray<{
    readonly offset: number;
    readonly length: number;
    readonly type: string;
    readonly url?: string | null;
  }>;
  readonly groupedId?: string | null;
}

export interface CryptoNewsSource {
  channelId: string;
  handle: string | null;
  title: string;
  type?: string;
  isActive: boolean;
  lifecycleStatus: string;
  addedAt: string;
}

export interface ContentFilter {
  readonly id: string;
  readonly channelId: string;
  readonly pattern: string;
  readonly replacement: string;
  readonly flags: string;
  readonly priority: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateFilterDto {
  channelId: string;
  pattern: string;
  replacement: string;
  flags: string;
  priority: number;
  isActive: boolean;
}

export interface UpdateFilterDto {
  pattern?: string;
  replacement?: string;
  flags?: string;
  priority?: number;
  isActive?: boolean;
}

export type FeedMessageType = 'kol' | 'crypto-news';

export const cryptoNewsKeys = {
  all: ['crypto-news'] as const,
  messages: (limit: number, channelId?: string, type?: FeedMessageType) =>
    [...cryptoNewsKeys.all, 'messages', { limit, channelId, type }] as const,
  sources: (type: FeedMessageType = 'crypto-news') =>
    [...cryptoNewsKeys.all, 'sources', { type }] as const,
  filters: (channelId: string) =>
    [...cryptoNewsKeys.all, 'filters', channelId] as const,
};

export async function fetchCryptoNewsMessages(
  limit = 50,
  channelId?: string,
  type?: FeedMessageType,
): Promise<ReadonlyArray<CryptoNewsMessage>> {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (channelId) qs.set('channelId', channelId);
  if (type) qs.set('type', type);

  // New format: { timestamp, count, data: CryptoNewsMessage[] }
  // Extract the data array from the response wrapper
  const response = await httpGet<{
    timestamp: string;
    count: number;
    data: ReadonlyArray<CryptoNewsMessage>;
  }>(`/ingestion-api/feed/messages?${qs.toString()}`);

  return response.data;
}

export async function fetchCryptoNewsSources(
  type: FeedMessageType = 'crypto-news',
): Promise<ReadonlyArray<CryptoNewsSource>> {
  return httpGet<ReadonlyArray<CryptoNewsSource>>(
    `/ingestion-api/feed/sources?type=${type}`,
  );
}

// ====================================================================
// CONTENT FILTER API FUNCTIONS
// ====================================================================

/**
 * Fetch all content filters for a specific channel.
 * Returns filters ordered by priority ASC, then createdAt ASC.
 */
export async function fetchFilters(
  channelId: string,
): Promise<ReadonlyArray<ContentFilter>> {
  return httpGet<ReadonlyArray<ContentFilter>>(
    `/crypto-news/sources/${channelId}/filters`,
  );
}

/**
 * Create a new content filter for a channel.
 */
export async function createFilter(
  dto: CreateFilterDto,
): Promise<ContentFilter> {
  return httpPost<CreateFilterDto, ContentFilter>(
    `/crypto-news/sources/${dto.channelId}/filters`,
    dto,
  );
}

/**
 * Update an existing content filter.
 * Backend serves PUT /crypto-news/filters/:id (no PATCH route).
 */
export async function updateFilter(
  id: string,
  dto: UpdateFilterDto,
): Promise<ContentFilter> {
  return httpPut<UpdateFilterDto, ContentFilter>(
    `/crypto-news/filters/${id}`,
    dto,
  );
}

/**
 * Delete a content filter by ID.
 */
export async function deleteFilter(id: string): Promise<void> {
  await httpDelete(`/crypto-news/filters/${id}`);
}

/**
 * Toggle the isActive state of a content filter.
 */
export async function toggleFilter(
  id: string,
): Promise<{ id: string; isActive: boolean }> {
  return httpPatch<Record<string, never>, { id: string; isActive: boolean }>(
    `/crypto-news/filters/${id}/toggle`,
    {},
  );
}
