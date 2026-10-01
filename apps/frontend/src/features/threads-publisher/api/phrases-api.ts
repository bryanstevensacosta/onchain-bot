import { httpGet } from '@/shared/api/http-client';
import { threadsPublisherKeys } from '@/entities/threads';

export type ThreadsMatchMode = 'exact' | 'substring';

/**
 * Threads phrase entry — frontend mirror of the backend
 * `ThreadsPhraseEntry` (threads publisher phrases.controller.ts).
 */
export interface ThreadsPhraseEntry {
  readonly id: string;
  readonly phrase: string;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly caseSensitive: boolean;
  readonly matchMode: ThreadsMatchMode;
  readonly table: 'keyword' | 'blacklist';
  readonly createdAt: string;
}

export interface ThreadsConflictCheckResult {
  readonly exists: boolean;
  readonly asKeyword: boolean;
  readonly asBlacklist: boolean;
  readonly details: {
    readonly keyword?: {
      id: string;
      phrase: string;
      caseSensitive: boolean;
      matchMode: ThreadsMatchMode;
    };
    readonly blacklist?: {
      id: string;
      phrase: string;
      caseSensitive: boolean;
      matchMode: ThreadsMatchMode;
    };
  };
}

export const threadsPhrasesKeys = {
  all: [...threadsPublisherKeys.all, 'phrases'] as const,
  list: () => [...threadsPhrasesKeys.all, 'list'] as const,
  search: (q: string, table?: 'keyword' | 'blacklist') =>
    [...threadsPhrasesKeys.all, 'search', { q, table }] as const,
  conflictCheck: (
    phrase: string,
    caseSensitive?: boolean,
    matchMode?: ThreadsMatchMode,
  ) =>
    [
      ...threadsPhrasesKeys.all,
      'conflict-check',
      { phrase, caseSensitive, matchMode },
    ] as const,
};

export async function fetchThreadsPhrases(): Promise<
  ReadonlyArray<ThreadsPhraseEntry>
> {
  return httpGet<ReadonlyArray<ThreadsPhraseEntry>>(
    '/feed-threads-publisher/phrases',
  );
}

export async function searchThreadsPhrases(
  q: string,
  table?: 'keyword' | 'blacklist',
): Promise<ReadonlyArray<ThreadsPhraseEntry>> {
  const params = new URLSearchParams();
  params.set('q', q);
  if (table) {
    params.set('table', table);
  }
  return httpGet<ReadonlyArray<ThreadsPhraseEntry>>(
    `/feed-threads-publisher/phrases/search?${params.toString()}`,
  );
}

export async function checkThreadsConflict(
  phrase: string,
  caseSensitive?: boolean,
  matchMode?: ThreadsMatchMode,
): Promise<ThreadsConflictCheckResult> {
  const params = new URLSearchParams();
  params.set('phrase', phrase);
  if (caseSensitive !== undefined) {
    params.set('caseSensitive', String(caseSensitive));
  }
  if (matchMode) {
    params.set('matchMode', matchMode);
  }
  return httpGet<ThreadsConflictCheckResult>(
    `/feed-threads-publisher/phrases/conflict-check?${params.toString()}`,
  );
}
