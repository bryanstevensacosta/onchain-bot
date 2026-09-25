import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';
import { threadsPublisherKeys } from '@/entities/threads';

/**
 * Threads blacklist phrase view — frontend mirror of the backend
 * `ThreadsBlacklistPhraseView` (threads publisher blacklist.controller.ts).
 */
export interface ThreadsBlacklistPhraseView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly matchMode: 'exact' | 'substring';
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly createdAt: string;
}

export interface CreateThreadsBlacklistBody {
  phrase: string;
  matchMode?: 'exact' | 'substring';
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
  andGroupId?: string | null;
  requireMedia?: boolean;
}

export interface CreateThreadsBlacklistBatchBody {
  phrases: Array<{
    phrase: string;
    caseSensitive?: boolean;
    matchMode?: 'exact' | 'substring';
    enabled?: boolean;
    sourceChannelIds?: string[];
    requireMedia?: boolean;
  }>;
}

export interface UpdateThreadsBlacklistBody {
  phrase?: string;
  matchMode?: 'exact' | 'substring';
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
  andGroupId?: string | null;
  requireMedia?: boolean;
}

export const threadsBlacklistKeys = {
  all: [...threadsPublisherKeys.all, 'blacklist'] as const,
  list: () => [...threadsBlacklistKeys.all, 'list'] as const,
};

export async function fetchThreadsBlacklist(): Promise<
  ReadonlyArray<ThreadsBlacklistPhraseView>
> {
  return httpGet<ReadonlyArray<ThreadsBlacklistPhraseView>>(
    '/feed-threads-publisher/blacklist',
  );
}

export async function createThreadsBlacklist(
  body: CreateThreadsBlacklistBody,
): Promise<ThreadsBlacklistPhraseView> {
  return httpPost<CreateThreadsBlacklistBody, ThreadsBlacklistPhraseView>(
    '/feed-threads-publisher/blacklist',
    body,
  );
}

export async function createThreadsBlacklistBatch(
  body: CreateThreadsBlacklistBatchBody,
): Promise<ReadonlyArray<ThreadsBlacklistPhraseView>> {
  return httpPost<
    CreateThreadsBlacklistBatchBody,
    ReadonlyArray<ThreadsBlacklistPhraseView>
  >('/feed-threads-publisher/blacklist/batch', body);
}

export async function updateThreadsBlacklist(
  id: string,
  body: UpdateThreadsBlacklistBody,
): Promise<ThreadsBlacklistPhraseView> {
  return httpPatch<UpdateThreadsBlacklistBody, ThreadsBlacklistPhraseView>(
    `/feed-threads-publisher/blacklist/${encodeURIComponent(id)}`,
    body,
  );
}

export async function deleteThreadsBlacklist(id: string): Promise<void> {
  await httpDelete<void>(
    `/feed-threads-publisher/blacklist/${encodeURIComponent(id)}`,
  );
}
