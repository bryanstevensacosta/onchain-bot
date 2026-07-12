import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';

export interface BlacklistPhraseView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly createdAt: string;
}

export interface CreateBlacklistBody {
  phrase: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
}

export interface UpdateBlacklistBody {
  phrase?: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
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
