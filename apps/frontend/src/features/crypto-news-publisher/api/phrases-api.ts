import { httpGet } from '@/shared/api/http-client';

export type MatchMode = 'exact' | 'substring';

export interface PhraseEntry {
  readonly id: string;
  readonly phrase: string;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly caseSensitive: boolean;
  readonly matchMode: MatchMode;
  readonly table: 'keyword' | 'blacklist';
  readonly createdAt: string;
}

export interface ConflictCheckResult {
  readonly exists: boolean;
  readonly asKeyword: boolean;
  readonly asBlacklist: boolean;
  readonly details: {
    readonly keyword?: {
      id: string;
      phrase: string;
      caseSensitive: boolean;
      matchMode: MatchMode;
    };
    readonly blacklist?: {
      id: string;
      phrase: string;
      caseSensitive: boolean;
      matchMode: MatchMode;
    };
  };
}

export const phrasesKeys = {
  all: ['crypto-news-publisher', 'phrases'] as const,
  list: () => [...phrasesKeys.all, 'list'] as const,
  search: (q: string, table?: 'keyword' | 'blacklist') =>
    [...phrasesKeys.all, 'search', { q, table }] as const,
  conflictCheck: (
    phrase: string,
    caseSensitive?: boolean,
    matchMode?: MatchMode,
  ) =>
    [
      ...phrasesKeys.all,
      'conflict-check',
      { phrase, caseSensitive, matchMode },
    ] as const,
};

export async function fetchPhrases(): Promise<ReadonlyArray<PhraseEntry>> {
  return httpGet<ReadonlyArray<PhraseEntry>>('/crypto-news-publisher/phrases');
}

export async function searchPhrases(
  q: string,
  table?: 'keyword' | 'blacklist',
): Promise<ReadonlyArray<PhraseEntry>> {
  const params = new URLSearchParams();
  params.set('q', q);
  if (table) {
    params.set('table', table);
  }
  return httpGet<ReadonlyArray<PhraseEntry>>(
    `/crypto-news-publisher/phrases/search?${params.toString()}`,
  );
}

export async function checkConflict(
  phrase: string,
  caseSensitive?: boolean,
  matchMode?: MatchMode,
): Promise<ConflictCheckResult> {
  const params = new URLSearchParams();
  params.set('phrase', phrase);
  if (caseSensitive !== undefined) {
    params.set('caseSensitive', String(caseSensitive));
  }
  if (matchMode) {
    params.set('matchMode', matchMode);
  }
  return httpGet<ConflictCheckResult>(
    `/crypto-news-publisher/phrases/conflict-check?${params.toString()}`,
  );
}
