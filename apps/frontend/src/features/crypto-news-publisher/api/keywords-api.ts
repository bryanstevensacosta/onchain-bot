import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from '@/shared/api/http-client';

export interface KeywordView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly enabled: boolean;
  readonly createdAt: string;
}

export interface CreateKeywordBody {
  phrase: string;
  caseSensitive?: boolean;
  enabled?: boolean;
}

export interface UpdateKeywordBody {
  phrase?: string;
  caseSensitive?: boolean;
  enabled?: boolean;
}

export const keywordsKeys = {
  all: ['crypto-news-publisher', 'keywords'] as const,
  list: () => [...keywordsKeys.all, 'list'] as const,
};

export async function fetchKeywords(): Promise<ReadonlyArray<KeywordView>> {
  return httpGet<ReadonlyArray<KeywordView>>('/crypto-news-publisher/keywords');
}

export async function createKeyword(
  body: CreateKeywordBody,
): Promise<KeywordView> {
  return httpPost<CreateKeywordBody, KeywordView>(
    '/crypto-news-publisher/keywords',
    body,
  );
}

export async function updateKeyword(
  id: string,
  body: UpdateKeywordBody,
): Promise<KeywordView> {
  return httpPatch<UpdateKeywordBody, KeywordView>(
    `/crypto-news-publisher/keywords/${encodeURIComponent(id)}`,
    body,
  );
}

export async function deleteKeyword(id: string): Promise<void> {
  await httpDelete<void>(
    `/crypto-news-publisher/keywords/${encodeURIComponent(id)}`,
  );
}
