import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { threadsMatchingKeys, threadsPublisherKeys } from '@/entities/threads';
import {
  createThreadsBlacklist,
  createThreadsBlacklistBatch,
  deleteThreadsBlacklist,
  fetchThreadsBlacklist,
  threadsBlacklistKeys,
  updateThreadsBlacklist,
} from '@/features/threads-publisher/api/blacklist-api';
import {
  checkThreadsConflict,
  fetchThreadsPhrases,
  searchThreadsPhrases,
  threadsPhrasesKeys,
} from '@/features/threads-publisher/api/phrases-api';
import {
  cancelThreadsQueueEntry,
  fetchThreadsQueue,
  fetchThreadsQueueCounts,
  threadsQueueKeys,
} from '@/features/threads-publisher/api/queue-api';
import {
  createThreadsKeyword,
  createThreadsKeywordBatch,
  deleteThreadsKeyword,
  fetchThreadsKeywords,
  threadsKeywordsKeys,
  updateThreadsKeyword,
} from '@/features/threads-publisher/api/keywords-api';
import {
  createThreadsTemplate,
  deleteThreadsTemplate,
  fetchThreadsLlmConfig,
  fetchThreadsLlmModels,
  fetchThreadsMatchingConfig,
  fetchThreadsMatchingHealth,
  fetchThreadsTemplate,
  fetchThreadsTemplates,
  threadsLlmConfigKeys,
  threadsMatchingConfigKeys,
  threadsMatchingHealthKeys,
  updateThreadsLlmConfig,
  updateThreadsMatchingConfig,
  updateThreadsTemplate,
} from '@/features/threads-publisher/api/llm-config-api';

interface SeenRequest {
  url: string;
  method: string;
}

const seen: SeenRequest[] = [];

function pathnameOf(url: string): string {
  return new URL(url, 'http://localhost').pathname;
}

afterEach(() => {
  vi.unstubAllGlobals();
  seen.length = 0;
});

function stubFetch(): void {
  vi.stubGlobal('fetch', (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    const method =
      init?.method ?? (input instanceof Request ? input.method : 'GET');
    seen.push({ url, method });
    return new Response('null', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch);
}

describe('threads api endpoint URLs', () => {
  it('every threads fetch fn hits /threads-publisher/* or /threads/matching/*, never /crypto-news*', async () => {
    stubFetch();

    await fetchThreadsKeywords();
    await createThreadsKeyword({ phrase: 'sol' });
    await createThreadsKeywordBatch({ phrases: [{ phrase: 'eth' }] });
    await updateThreadsKeyword('k1', { phrase: 'solana' });
    await deleteThreadsKeyword('k1');

    await fetchThreadsBlacklist();
    await createThreadsBlacklist({ phrase: 'rug' });
    await createThreadsBlacklistBatch({ phrases: [{ phrase: 'scam' }] });
    await updateThreadsBlacklist('b1', { phrase: 'honeypot' });
    await deleteThreadsBlacklist('b1');

    await fetchThreadsPhrases();
    await searchThreadsPhrases('btc', 'keyword');
    await checkThreadsConflict('eth', true, 'exact');

    await fetchThreadsQueue(25, 'PENDING');
    await fetchThreadsQueue();
    await fetchThreadsQueueCounts();
    await cancelThreadsQueueEntry('q1');

    await fetchThreadsLlmModels();
    await fetchThreadsLlmConfig();
    await updateThreadsLlmConfig({ dailyCap: 42 });
    await fetchThreadsTemplates();
    await fetchThreadsTemplate('t1');
    await createThreadsTemplate({
      name: 'threads-default',
      description: null,
      model: 'opencode-zen/deepseek-v4-flash',
      supportsVision: false,
      maxTokens: 2000,
      temperature: 0.7,
      reasoningEffort: null,
      promptText: 'Summarize in under 500 chars: {{original}}',
      systemPromptText: '',
    });
    await updateThreadsTemplate('t1', { temperature: 0.5 });
    await deleteThreadsTemplate('t1');

    await fetchThreadsMatchingConfig();
    await updateThreadsMatchingConfig({ enabled: false });
    await fetchThreadsMatchingHealth();

    expect(seen.length).toBeGreaterThan(20);
    for (const req of seen) {
      const path = pathnameOf(req.url);
      expect(
        path.startsWith('/threads-publisher/') ||
          path.startsWith('/threads/matching/'),
        `unexpected threads URL: ${req.method} ${req.url}`,
      ).toBe(true);
    }
    expect(seen.filter((req) => req.url.includes('/crypto-news'))).toEqual([]);
  });

  it('queue cancel issues DELETE against /threads-publisher/queue/:id', async () => {
    stubFetch();
    await cancelThreadsQueueEntry('entry-9');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('DELETE');
    expect(pathnameOf(seen[0]?.url ?? '')).toBe(
      '/threads-publisher/queue/entry-9',
    );
  });
});

describe('threads query-key factories', () => {
  it('roots at threads-publisher + threads/matching, never a bare single-element key', () => {
    expect(threadsPublisherKeys.all).toEqual(['threads-publisher']);
    expect(threadsMatchingKeys.all).toEqual(['threads', 'matching']);

    const produced: ReadonlyArray<readonly unknown[]> = [
      threadsPublisherKeys.keywords(),
      threadsPublisherKeys.blacklist(),
      threadsPublisherKeys.phrases(),
      threadsPublisherKeys.queue(),
      threadsPublisherKeys.llm(),
      threadsMatchingKeys.config(),
      threadsMatchingKeys.health(),
      threadsKeywordsKeys.all,
      threadsKeywordsKeys.list(),
      threadsBlacklistKeys.all,
      threadsBlacklistKeys.list(),
      threadsPhrasesKeys.all,
      threadsPhrasesKeys.list(),
      threadsPhrasesKeys.search('x'),
      threadsPhrasesKeys.conflictCheck('y'),
      threadsQueueKeys.all,
      threadsQueueKeys.list(10),
      threadsQueueKeys.counts(),
      threadsLlmConfigKeys.all,
      threadsLlmConfigKeys.models(),
      threadsLlmConfigKeys.config(),
      threadsLlmConfigKeys.templates(),
      threadsLlmConfigKeys.template('t1'),
      threadsMatchingConfigKeys.all,
      threadsMatchingConfigKeys.config(),
      threadsMatchingHealthKeys.all,
      threadsMatchingHealthKeys.health(),
    ];
    expect(produced.length).toBeGreaterThan(20);
    for (const key of produced) {
      expect(key).not.toEqual(['threads']);
    }
    for (const key of produced) {
      expect(key[0]).toMatch(/^(threads-publisher|threads)$/);
    }
  });
});
