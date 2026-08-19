import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';

export interface BlacklistPhraseView {
  readonly id: string;
  readonly phrase: string;
  readonly matchMode: 'exact' | 'substring';
  readonly caseSensitive: boolean;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
}

export interface CreateBlacklistBody {
  phrase: string;
  matchMode?: 'exact' | 'substring';
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
  andGroupId?: string | null;
  requireMedia?: boolean;
}

export interface CreateBlacklistBatchBody {
  phrases: Array<{
    phrase: string;
    caseSensitive?: boolean;
    matchMode?: 'exact' | 'substring';
    enabled?: boolean;
    sourceChannelIds?: string[];
    requireMedia?: boolean;
  }>;
}

export interface UpdateBlacklistBody {
  phrase?: string;
  matchMode?: 'exact' | 'substring';
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
  andGroupId?: string | null;
  requireMedia?: boolean;
}

export const blacklistKeys = {
  all: ['crypto-news-publisher', 'blacklist'] as const,
  list: () => [...blacklistKeys.all, 'list'] as const,
};

export async function fetchBlacklist(): Promise<
  ReadonlyArray<BlacklistPhraseView>
> {
  return httpGet<ReadonlyArray<BlacklistPhraseView>>(
    '/crypto-news-publisher/blacklist',
  );
}

export async function createBlacklist(
  body: CreateBlacklistBody,
): Promise<BlacklistPhraseView> {
  return httpPost<CreateBlacklistBody, BlacklistPhraseView>(
    '/crypto-news-publisher/blacklist',
    body,
  );
}

export async function createBlacklistBatch(
  body: CreateBlacklistBatchBody,
): Promise<ReadonlyArray<BlacklistPhraseView>> {
  return httpPost<CreateBlacklistBatchBody, ReadonlyArray<BlacklistPhraseView>>(
    '/crypto-news-publisher/blacklist/batch',
    body,
  );
}

export async function updateBlacklist(
  id: string,
  body: UpdateBlacklistBody,
): Promise<BlacklistPhraseView> {
  return httpPatch<UpdateBlacklistBody, BlacklistPhraseView>(
    `/crypto-news-publisher/blacklist/${encodeURIComponent(id)}`,
    body,
  );
}

export async function deleteBlacklist(id: string): Promise<void> {
  await httpDelete<void>(
    `/crypto-news-publisher/blacklist/${encodeURIComponent(id)}`,
  );
}
