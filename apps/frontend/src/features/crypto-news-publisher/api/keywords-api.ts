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
  readonly sourceChannelId: string | null;
  readonly enabled: boolean;
  /**
   * When true, only messages with at least one media item are
   * enqueued for this keyword; otherwise the match is dropped.
   */
  readonly requireImage: boolean;
  /**
   * Optional `PromptTemplate` override. When `null` the keyword falls
   * back to `LlmConfig.defaultTemplateId` at publish time.
   */
  readonly templateId: string | null;
  readonly createdAt: string;
}

export interface CreateKeywordBody {
  phrase: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelId?: string | null;
  /**
   * Optional override binding. `null` (default) uses the global
   * default template; a string binds the keyword to that template.
   */
  templateId?: string | null;
  requireImage?: boolean;
}

export interface UpdateKeywordBody {
  phrase?: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelId?: string | null;
  /**
   * Partial template binding update:
   *  - `undefined` → leave existing binding untouched
   *  - `null`      → clear the binding (fall back to default)
   *  - `"<uuid>"`  → bind to that template
   */
  templateId?: string | null;
  requireImage?: boolean;
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
