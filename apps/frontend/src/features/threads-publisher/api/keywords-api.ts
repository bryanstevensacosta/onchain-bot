import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';
import { threadsPublisherKeys } from '@/entities/threads';

/**
 * Threads keyword view — frontend mirror of the backend
 * `ThreadsKeywordView` (threads publisher keywords.controller.ts).
 */
export interface ThreadsKeywordView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly templateId: string | null;
  readonly matchMode: 'exact' | 'substring';
  readonly createdAt: string;
}

export interface CreateThreadsKeywordBody {
  phrase: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
  templateId?: string | null;
  requireMedia?: boolean;
  matchMode?: 'exact' | 'substring';
  andGroupId?: string | null;
}

export interface CreateThreadsKeywordBatchBody {
  phrases: CreateThreadsKeywordBody[];
}

export interface UpdateThreadsKeywordBody {
  phrase?: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
  templateId?: string | null;
  requireMedia?: boolean;
  matchMode?: 'exact' | 'substring';
  andGroupId?: string | null;
}

export const threadsKeywordsKeys = {
  all: [...threadsPublisherKeys.all, 'keywords'] as const,
  list: () => [...threadsKeywordsKeys.all, 'list'] as const,
};

export async function fetchThreadsKeywords(): Promise<
  ReadonlyArray<ThreadsKeywordView>
> {
  return httpGet<ReadonlyArray<ThreadsKeywordView>>(
    '/feed-threads-publisher/keywords',
  );
}

export async function createThreadsKeyword(
  body: CreateThreadsKeywordBody,
): Promise<ThreadsKeywordView> {
  return httpPost<CreateThreadsKeywordBody, ThreadsKeywordView>(
    '/feed-threads-publisher/keywords',
    body,
  );
}

export async function createThreadsKeywordBatch(
  body: CreateThreadsKeywordBatchBody,
): Promise<ReadonlyArray<ThreadsKeywordView>> {
  return httpPost<
    CreateThreadsKeywordBatchBody,
    ReadonlyArray<ThreadsKeywordView>
  >('/feed-threads-publisher/keywords/batch', body);
}

export async function updateThreadsKeyword(
  id: string,
  body: UpdateThreadsKeywordBody,
): Promise<ThreadsKeywordView> {
  return httpPatch<UpdateThreadsKeywordBody, ThreadsKeywordView>(
    `/feed-threads-publisher/keywords/${encodeURIComponent(id)}`,
    body,
  );
}

export async function deleteThreadsKeyword(id: string): Promise<void> {
  await httpDelete<void>(
    `/feed-threads-publisher/keywords/${encodeURIComponent(id)}`,
  );
}
