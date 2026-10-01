// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchLlmConfig,
  fetchMatchingConfig,
  fetchMatchingHealth,
  fetchPipelineFlags,
  updateMatchingConfig,
} from './llm-config-api';
import { fetchFeedQueueStats } from './queue-api';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('feed-publisher migrated fetchers (Tramo 2, todo 9)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches matching config from the feed-publisher service', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 1,
        enabled: true,
        updatedAt: '2026-09-25T00:00:00.000Z',
      }),
    );
    await fetchMatchingConfig();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/feed-api/feed-publisher/matching/config',
    );
  });

  it('patches matching config on the feed-publisher service', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 1,
        enabled: false,
        updatedAt: '2026-09-25T00:00:00.000Z',
      }),
    );
    await updateMatchingConfig({ enabled: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/feed-api/feed-publisher/matching/config');
    expect(init.method).toBe('PATCH');
  });

  it('fetches matching health from the feed-publisher service', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        enabled: true,
        lastTickAt: null,
        lastFetchOk: true,
        consecutiveFetchFailures: 0,
        lastEnqueuedAt: null,
        queuePending: 0,
      }),
    );
    await fetchMatchingHealth();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/feed-api/feed-publisher/matching/health',
    );
  });

  it('fetches llm config from the feed-publisher service', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        defaultTemplateId: 'tpl-1',
        targetChannel: '@news',
        llmEnabled: true,
        publishingEnabled: true,
        rejectNonLatin: true,
        dailyCap: 50,
        dailyResetUtcHour: 0,
        randomDelayMinMs: 1000,
        randomDelayMaxMs: 5000,
        llmMaxAttempts: 3,
        updatedAt: '2026-09-25T00:00:00.000Z',
      }),
    );
    const cfg = await fetchLlmConfig();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/feed-api/api/llm/config',
    );
    expect(cfg.id).toBeUndefined();
  });

  it('fetches the composed 3-flag view', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        flags: { matching: true, llm: true, publishing: true },
        llmActive: true,
        mode: 'full-pipeline',
      }),
    );
    const flags = await fetchPipelineFlags();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/feed-api/api/llm/flags',
    );
    expect(flags.mode).toBe('full-pipeline');
  });

  it('fetches queue stats from the feed-publisher service', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        pending: 2,
        scheduled: 0,
        publishing: 0,
        published: 5,
        failed: 0,
        blocked: 1,
        total: 8,
        lastTickAt: null,
        lastProcessedAt: null,
        consecutiveFailures: 0,
      }),
    );
    const stats = await fetchFeedQueueStats();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/feed-api/api/queue/stats',
    );
    expect(stats.total).toBe(8);
  });
});
