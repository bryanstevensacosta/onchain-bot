// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ThreadsPage } from './index';

function renderWithClient(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const fetchSpy = vi.fn();

function mockFetchRouter(url: string) {
  if (url.includes('/threads-publisher/keywords')) {
    return jsonResponse([
      {
        id: 'tkw-1',
        phrase: 'SEC',
        caseSensitive: true,
        enabled: true,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ]);
  }
  if (url.includes('/threads-publisher/blacklist')) {
    return jsonResponse([]);
  }
  if (url.includes('/threads-publisher/queue/counts')) {
    return jsonResponse({ pending: 5, publishedToday: 12, remaining: 24 });
  }
  if (url.includes('status=BLOCKED')) {
    return jsonResponse([
      {
        id: 'tq-blocked-1',
        channelId: '-1001',
        displayName: 'WatcherGuru',
        messageId: 999,
        rawTitle: 'Blocked Threads post',
        rawContent: null,
        status: 'BLOCKED',
        messageReceivedAt: '2025-01-02T03:04:05.000Z',
        publishedAt: null,
        blockedReason: 'blacklisted phrase hit',
        lastError: null,
        attempts: 0,
        generatedContent: null,
      },
    ]);
  }
  if (url.includes('/threads-publisher/queue')) {
    return jsonResponse([
      {
        id: 'tq-1',
        channelId: '-1001',
        displayName: 'WatcherGuru',
        messageId: 777,
        rawTitle: 'Threads ETF approval imminent',
        rawContent: null,
        status: 'PENDING',
        messageReceivedAt: '2025-01-02T03:04:05.000Z',
        publishedAt: null,
        blockedReason: null,
        lastError: null,
        attempts: 0,
        generatedContent: null,
      },
    ]);
  }
  if (url.includes('/threads/matching/config')) {
    return jsonResponse({
      id: 1,
      enabled: false,
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
  }
  if (url.includes('/threads/matching/health')) {
    return jsonResponse({
      enabled: false,
      lastTickAt: null,
      lastFetchOk: true,
      consecutiveFetchFailures: 0,
      lastEnqueuedAt: null,
      queuePending: 5,
    });
  }
  if (url.includes('/threads-publisher/llm/config')) {
    return jsonResponse({
      id: 1,
      defaultTemplateId: 'threads-default',
      llmEnabled: false,
      publishingEnabled: false,
      rejectNonLatin: false,
      dailyCap: 60,
      dailyResetUtcHour: 4,
      randomDelayMinMs: 60000,
      randomDelayMaxMs: 300000,
      llmMaxAttempts: 3,
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
  }
  if (url.includes('/threads-publisher/llm/templates')) {
    return jsonResponse([
      {
        id: 'threads-default',
        name: 'threads-default',
        description: 'Default Threads template',
        model: 'opencode-zen/deepseek-v4-flash',
        supportsVision: false,
        maxTokens: 2000,
        temperature: 0.7,
        promptText: 'Rewrite (<500 chars): {{original}}',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ]);
  }
  return jsonResponse([]);
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockImplementation((url: string) =>
    Promise.resolve(mockFetchRouter(String(url))),
  );
  vi.stubGlobal('fetch', fetchSpy);
});

describe('ThreadsPage — 6 sections, no Ads', () => {
  it('renders header "Threads" and EXACTLY 6 details blocks', async () => {
    renderWithClient(<ThreadsPage />);

    expect(
      screen.getByRole('heading', { name: 'Threads' }),
    ).toBeInTheDocument();

    for (const name of [
      'Keywords',
      'Queue',
      'Blocked',
      'LLM Configuration',
      'Prompt Templates',
    ]) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
    // 'Content Filters' may render twice once a channel is entered
    // (page <summary> + T7 ThreadsSection h2), so assert plural-safe.
    expect(await screen.findAllByText('Content Filters')).not.toHaveLength(0);

    const details = document.querySelectorAll('details');
    expect(details).toHaveLength(6);
    expect(screen.queryByText('Ads')).not.toBeInTheDocument();
  });

  it('fetches Threads URLs (never crypto-news publisher URLs)', async () => {
    renderWithClient(<ThreadsPage />);

    await screen.findByText('SEC');
    await screen.findByText('Threads ETF approval imminent');

    const calledUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    for (const expected of [
      '/threads-publisher/keywords',
      '/threads-publisher/queue/counts',
      '/threads/matching/config',
      '/threads/matching/health',
      '/threads-publisher/llm/config',
      '/threads-publisher/llm/templates',
    ]) {
      expect(
        calledUrls.some((u) => u.includes(expected)),
        `expected fetch of ${expected}`,
      ).toBe(true);
    }
    expect(calledUrls.some((u) => u.includes('/crypto-news-publisher/'))).toBe(
      false,
    );
  });

  it('renders queue counters, queue row, and blocked row', async () => {
    renderWithClient(<ThreadsPage />);

    await screen.findByText('Threads ETF approval imminent');
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();

    expect(await screen.findByText('Blocked Threads post')).toBeInTheDocument();
    expect(screen.getByText('blacklisted phrase hit')).toBeInTheDocument();
  });

  it('renders 3 toggles and PATCHes matching config on toggle', async () => {
    fetchSpy.mockImplementation((url: string, init?: RequestInit) => {
      if (
        String(url).includes('/threads/matching/config') &&
        init?.method === 'PATCH'
      ) {
        return Promise.resolve(
          jsonResponse({
            id: 1,
            enabled: true,
            updatedAt: '2025-01-01T00:00:00.000Z',
          }),
        );
      }
      return Promise.resolve(mockFetchRouter(String(url)));
    });

    renderWithClient(<ThreadsPage />);

    // Wait for all toggle data sources to settle so buttons are enabled.
    await screen.findByText('threads-default');
    await screen.findByText('Threads ETF approval imminent');

    const matchingToggle = await screen.findByRole('button', {
      name: /Start Threads Matching/i,
    });
    expect(matchingToggle).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Enable Threads LLM/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Start Threads Publishing/i }),
    ).toBeInTheDocument();

    fireEvent.click(matchingToggle);

    await vi.waitFor(() => {
      const patchCalls = fetchSpy.mock.calls.filter(
        ([u, init]) =>
          String(u).includes('/threads/matching/config') &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('renders LLM config values and prompt template', async () => {
    renderWithClient(<ThreadsPage />);

    await screen.findByText('threads-default');
    expect(screen.getByText('Daily cap')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(
      screen.getByText('opencode-zen/deepseek-v4-flash'),
    ).toBeInTheDocument();
  });
});
