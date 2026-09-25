// @vitest-environment jsdom
import '@/test/setup';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createElement, type ReactNode } from 'react';

import type { ContentFilter } from '@/entities/threads';
import {
  threadsMatchingConfigKeys,
  threadsLlmConfigKeys,
} from '@/features/threads-publisher/api/llm-config-api';
import type {
  ThreadsBlacklistPhraseView,
  ThreadsKeywordView,
  ThreadsLlmConfigView,
  ThreadsMatchingConfig,
  ThreadsMatchingHealth,
  ThreadsPhraseEntry,
  ThreadsPromptTemplateView,
} from '@/features/threads-publisher';
import type { ThreadsLlmModel } from '@/features/threads-publisher/api/llm-config-api';
import type { ThreadsQueueEntryView } from '@/entities/threads';
import { useThreadsKeywords } from '@/features/threads-publisher/model/use-threads-keywords';
import { useThreadsBlacklist } from '@/features/threads-publisher/model/use-threads-blacklist';
import { useThreadsPhrases } from '@/features/threads-publisher/model/use-threads-phrases';
import {
  useThreadsQueue,
  useThreadsQueueCounts,
} from '@/features/threads-publisher/model/use-threads-queue';
import {
  useThreadsLlmConfig,
  useThreadsLlmModels,
  useThreadsMatchingConfig,
  useThreadsMatchingHealth,
  useThreadsTemplates,
  useToggleThreadsMatching,
  useUpdateThreadsLlmConfig,
} from '@/features/threads-publisher/model/use-threads-llm-config';
import { useThreadsFilters } from '@/entities/threads';

const keywordsFixture: ThreadsKeywordView[] = [
  {
    id: 'kw-1',
    phrase: 'solana',
    caseSensitive: false,
    sourceChannelIds: [],
    enabled: true,
    andGroupId: null,
    requireMedia: false,
    templateId: null,
    matchMode: 'substring',
    createdAt: new Date('2026-09-01').toISOString(),
  },
];

const blacklistFixture: ThreadsBlacklistPhraseView[] = [
  {
    id: 'bl-1',
    phrase: 'rug',
    caseSensitive: false,
    matchMode: 'substring',
    sourceChannelIds: [],
    enabled: true,
    andGroupId: null,
    requireMedia: false,
    createdAt: new Date('2026-09-01').toISOString(),
  },
];

const phrasesFixture: ThreadsPhraseEntry[] = [
  {
    id: 'kw-1',
    phrase: 'solana',
    sourceChannelIds: [],
    enabled: true,
    andGroupId: null,
    requireMedia: false,
    caseSensitive: false,
    matchMode: 'substring',
    table: 'keyword',
    createdAt: new Date('2026-09-01').toISOString(),
  },
];

const queueFixture: ThreadsQueueEntryView[] = [
  {
    id: 'qe-1',
    traceId: 'trace-1',
    channelId: '-100123',
    sourceHandle: null,
    sourceTitle: null,
    messageId: 42,
    rawTitle: null,
    rawContent: 'solana breaks out',
    imagePath: null,
    imagePaths: [],
    groupedId: null,
    matchedKeywordIds: ['kw-1'],
    status: 'PENDING',
    messageReceivedAt: new Date('2026-09-14').toISOString(),
    publishedAt: null,
    telegramMessageId: null,
    telegramUrl: null,
    lastError: null,
    attempts: 0,
    generatedContent: null,
    generatedSystemPrompt: null,
    generatedUserPrompt: null,
    generatedTemperature: null,
    generatedReasoningEffort: null,
    generatedModel: null,
    blockedReason: null,
    duplicateOfChannelId: null,
    duplicateOfMessageId: null,
    duplicateOfEntryId: null,
    duplicateOfSourceHandle: null,
    duplicateOfTelegramUrl: null,
    displayName: '-100123',
  },
];

const countsFixture = { pending: 3, publishedToday: 7, remaining: 53 };

const matchingConfigFixture: ThreadsMatchingConfig = {
  id: 1,
  enabled: false,
  updatedAt: new Date('2026-09-14').toISOString(),
};

const matchingHealthFixture: ThreadsMatchingHealth = {
  enabled: false,
  lastTickAt: new Date('2026-09-14').toISOString(),
  lastFetchOk: true,
  consecutiveFetchFailures: 0,
  lastEnqueuedAt: null,
  queuePending: 3,
};

const llmConfigFixture: ThreadsLlmConfigView = {
  id: 1,
  defaultTemplateId: 'threads-default',
  llmEnabled: true,
  publishingEnabled: true,
  rejectNonLatin: false,
  dailyCap: 60,
  dailyResetUtcHour: 4,
  randomDelayMinMs: 60_000,
  randomDelayMaxMs: 300_000,
  llmMaxAttempts: 3,
  updatedAt: new Date('2026-09-14').toISOString(),
};

const templatesFixture: ThreadsPromptTemplateView[] = [
  {
    id: 'threads-default',
    name: 'threads-default',
    description: null,
    model: 'opencode-zen/deepseek-v4-flash',
    supportsVision: false,
    maxTokens: 2000,
    temperature: 0.7,
    reasoningEffort: null,
    promptText: 'Summarize in under 500 chars: {{original}}',
    systemPromptText: '',
    createdAt: new Date('2026-09-01').toISOString(),
    updatedAt: new Date('2026-09-01').toISOString(),
  },
];

const modelsFixture: ThreadsLlmModel[] = [
  { id: 'opencode-zen/deepseek-v4-flash' },
];

const filtersFixture: ContentFilter[] = [
  {
    id: 'f-1',
    channelId: '-100123',
    pattern: 'spam',
    replacement: '',
    flags: 'gi',
    priority: 0,
    isActive: true,
    createdAt: new Date('2026-09-01').toISOString(),
    updatedAt: new Date('2026-09-01').toISOString(),
  },
];

const server = setupServer(
  http.get('*/feed-threads-publisher/keywords', () =>
    HttpResponse.json(keywordsFixture),
  ),
  http.get('*/feed-threads-publisher/blacklist', () =>
    HttpResponse.json(blacklistFixture),
  ),
  http.get('*/feed-threads-publisher/phrases', () =>
    HttpResponse.json(phrasesFixture),
  ),
  http.get('*/feed-threads-publisher/queue/counts', () =>
    HttpResponse.json(countsFixture),
  ),
  http.get('*/feed-threads-publisher/queue', () =>
    HttpResponse.json(queueFixture),
  ),
  http.get('*/threads/matching/config', () =>
    HttpResponse.json(matchingConfigFixture),
  ),
  http.patch('*/threads/matching/config', async ({ request }) => {
    const body = (await request.json()) as { enabled?: boolean };
    return HttpResponse.json({ ...matchingConfigFixture, ...body });
  }),
  http.get('*/threads/matching/health', () =>
    HttpResponse.json(matchingHealthFixture),
  ),
  http.get('*/feed-threads-publisher/llm/config', () =>
    HttpResponse.json(llmConfigFixture),
  ),
  http.patch('*/feed-threads-publisher/llm/config', async ({ request }) => {
    const body = (await request.json()) as Partial<ThreadsLlmConfigView>;
    return HttpResponse.json({ ...llmConfigFixture, ...body });
  }),
  http.get('*/feed-threads-publisher/llm/templates', () =>
    HttpResponse.json(templatesFixture),
  ),
  http.get('*/feed-threads-publisher/llm/models', () =>
    HttpResponse.json(modelsFixture),
  ),
  // Shared filter routes are intentionally reused (same backend for both
  // products) — they are NOT threads endpoints.
  http.get('*/crypto-news/sources/:channelId/filters', () =>
    HttpResponse.json(filtersFixture),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper(
  client: QueryClient,
): ({ children }: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('threads hooks against MSW', () => {
  it('useThreadsKeywords returns the keyword list', async () => {
    const { result } = renderHook(() => useThreadsKeywords(), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(keywordsFixture);
  });

  it('useThreadsBlacklist returns the blacklist list', async () => {
    const { result } = renderHook(() => useThreadsBlacklist(), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(blacklistFixture);
  });

  it('useThreadsPhrases returns the phrase union', async () => {
    const { result } = renderHook(() => useThreadsPhrases(), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(phrasesFixture);
  });

  it('useThreadsQueue returns entries for limit+status', async () => {
    const { result } = renderHook(() => useThreadsQueue(25, 'PENDING'), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(queueFixture);
  });

  it('useThreadsQueueCounts returns {pending,publishedToday,remaining}', async () => {
    const { result } = renderHook(() => useThreadsQueueCounts(), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(countsFixture);
  });

  it('useThreadsMatchingConfig returns {enabled}', async () => {
    const { result } = renderHook(() => useThreadsMatchingConfig(), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.enabled).toBe(false);
  });

  it('useThreadsMatchingHealth returns the 6-field view', async () => {
    const { result } = renderHook(() => useThreadsMatchingHealth(), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(matchingHealthFixture);
  });

  it('useThreadsLlmConfig returns the config view', async () => {
    const { result } = renderHook(() => useThreadsLlmConfig(), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(llmConfigFixture);
  });

  it('useThreadsTemplates returns the template library', async () => {
    const { result } = renderHook(() => useThreadsTemplates(), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(templatesFixture);
  });

  it('useThreadsLlmModels returns the gateway model list', async () => {
    const { result } = renderHook(() => useThreadsLlmModels(), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.data).toEqual(modelsFixture));
  });

  it('useThreadsFilters reuses the shared filter feed for a channel', async () => {
    const { result } = renderHook(() => useThreadsFilters('-100123'), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(filtersFixture);
  });

  it('useToggleThreadsMatching flips enabled via PATCH /threads/matching/config', async () => {
    const client = freshClient();
    const { result } = renderHook(() => useToggleThreadsMatching(), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.isPending).toBe(false);
    await act(async () => {
      result.current.toggle();
    });
    await waitFor(() =>
      expect(
        client.getQueryData<ThreadsMatchingConfig>(
          threadsMatchingConfigKeys.config(),
        )?.enabled,
      ).toBe(true),
    );
    expect(result.current.isPending).toBe(false);
  });

  it('useUpdateThreadsLlmConfig patches the config view', async () => {
    const client = freshClient();
    const { result } = renderHook(() => useUpdateThreadsLlmConfig(), {
      wrapper: makeWrapper(client),
    });
    await act(async () => {
      result.current.update({ dailyCap: 42 });
    });
    await waitFor(() =>
      expect(
        client.getQueryData<ThreadsLlmConfigView>(threadsLlmConfigKeys.config())
          ?.dailyCap,
      ).toBe(42),
    );
    expect(result.current.isPending).toBe(false);
  });
});
