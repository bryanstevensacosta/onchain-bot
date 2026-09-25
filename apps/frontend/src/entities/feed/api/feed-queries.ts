import {
  httpGet,
  httpPost,
  httpPatch,
  httpPut,
  httpDelete,
} from '@/shared/api/http-client';

export interface FeedMediaView {
  readonly id: string;
  readonly index: number;
  readonly type: string;
  readonly url: string;
  readonly mimeType: string | null;
}

export interface FeedMessage {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly publishedAt: string;
  readonly ingestedAt: string;
  readonly media: ReadonlyArray<FeedMediaView>;
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

export interface FeedSource {
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

export const feedKeys = {
  all: ['crypto-news'] as const,
  messages: (limit: number, channelId?: string, type?: FeedMessageType) =>
    [...feedKeys.all, 'messages', { limit, channelId, type }] as const,
  sources: (type: FeedMessageType = 'crypto-news') =>
    [...feedKeys.all, 'sources', { type }] as const,
  filters: (channelId: string) =>
    [...feedKeys.all, 'filters', channelId] as const,
};

export async function fetchFeedMessages(
  limit = 50,
  channelId?: string,
  type?: FeedMessageType,
): Promise<ReadonlyArray<FeedMessage>> {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (channelId) qs.set('channelId', channelId);
  if (type) qs.set('type', type);

  // New format: { timestamp, count, data: FeedMessage[] }
  // Extract the data array from the response wrapper
  const response = await httpGet<{
    timestamp: string;
    count: number;
    data: ReadonlyArray<FeedMessage>;
  }>(`/ingestion-api/feed/messages?${qs.toString()}`);

  return response.data;
}

export async function fetchFeedSources(
  type: FeedMessageType = 'crypto-news',
): Promise<ReadonlyArray<FeedSource>> {
  return httpGet<ReadonlyArray<FeedSource>>(
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
 * Backend serves PUT /feed-filters/:id (no PATCH route).
 */
export async function updateFilter(
  id: string,
  dto: UpdateFilterDto,
): Promise<ContentFilter> {
  return httpPut<UpdateFilterDto, ContentFilter>(`/feed-filters/${id}`, dto);
}

/**
 * Delete a content filter by ID.
 */
export async function deleteFilter(id: string): Promise<void> {
  await httpDelete(`/feed-filters/${id}`);
}

/**
 * Toggle the isActive state of a content filter.
 */
export async function toggleFilter(
  id: string,
): Promise<{ id: string; isActive: boolean }> {
  return httpPatch<Record<string, never>, { id: string; isActive: boolean }>(
    `/feed-filters/${id}/toggle`,
    {},
  );
}
