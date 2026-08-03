// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { QueueRow } from './queue-view';
import type { QueueEntryView } from '../api/queue-api';

afterEach(cleanup);

vi.mock('@/features/crypto-news-publisher/model/use-queue', () => ({
  useQueue: vi.fn(),
  useQueueCounts: vi.fn(),
  useCancelQueueEntry: vi.fn(() => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  })),
}));

vi.mock('@/features/crypto-news-publisher/model/use-keywords', () => ({
  useKeywords: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateKeyword: vi.fn(),
  useCreateKeywordBatch: vi.fn(),
  useUpdateKeyword: vi.fn(),
  useDeleteKeyword: vi.fn(),
}));

function makeEntry(overrides: Partial<QueueEntryView> = {}): QueueEntryView {
  return {
    id: 'test-id',
    status: 'BLOCKED',
    channelId: '1350475252',
    messageId: 10201,
    messageReceivedAt: new Date('2026-08-03').toISOString(),
    sourceHandle: null,
    sourceTitle: null,
    displayName: '1350475252',
    telegramUrl: null,
    rawContent: '',
    rawTitle: null,
    imagePaths: [],
    imagePath: null,
    matchedKeywordIds: [],
    groupedId: null,
    publishedAt: null,
    telegramMessageId: null,
    lastError: null,
    attempts: 0,
    generatedContent: null,
    generatedSystemPrompt: null,
    generatedUserPrompt: null,
    generatedTemperature: null,
    generatedReasoningEffort: null,
    generatedModel: null,
    blockedReason: null,
    ...overrides,
  };
}

describe('QueueRow displayName', () => {
  it('renders displayName (handle-like value) plainly without leading @', () => {
    render(<QueueRow entry={makeEntry({ displayName: 'coinmarket' })} />);
    expect(screen.getByText('coinmarket')).toBeInTheDocument();
    expect(screen.queryByText('@coinmarket')).not.toBeInTheDocument();
  });

  it('renders displayName (title value)', () => {
    render(<QueueRow entry={makeEntry({ displayName: 'Crypto Insider' })} />);
    expect(screen.getByText('Crypto Insider')).toBeInTheDocument();
  });

  it('renders displayName (channelId fallback)', () => {
    render(<QueueRow entry={makeEntry({ displayName: '1350475252' })} />);
    expect(screen.getByText('1350475252')).toBeInTheDocument();
  });

  it('wraps displayName in a link when telegramUrl is present', () => {
    render(
      <QueueRow
        entry={makeEntry({
          displayName: 'coinmarket',
          telegramUrl: 'https://t.me/coinmarket/10201',
        })}
      />,
    );
    const link = screen.getByRole('link', { name: /coinmarket/ });
    expect(link).toHaveAttribute('href', 'https://t.me/coinmarket/10201');
  });
});
