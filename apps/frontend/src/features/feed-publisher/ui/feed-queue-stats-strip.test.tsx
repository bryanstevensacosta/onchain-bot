// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FeedQueueStatsStrip } from './feed-queue-stats-strip';
import * as queueHooks from '@/features/feed-publisher/model/use-queue';

const STATS = {
  pending: 3,
  scheduled: 1,
  publishing: 0,
  published: 12,
  failed: 2,
  blocked: 1,
  total: 19,
  lastTickAt: null,
  lastProcessedAt: null,
  consecutiveFailures: 0,
};

describe('FeedQueueStatsStrip', () => {
  it('renders per-status depth from the feed-publisher stats', () => {
    vi.spyOn(queueHooks, 'useFeedQueueStats').mockReturnValue({
      data: STATS,
      isLoading: false,
      error: null,
    } as ReturnType<typeof queueHooks.useFeedQueueStats>);
    render(<FeedQueueStatsStrip />);
    expect(screen.getByTestId('feed-queue-stats')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('renders nothing when the API is down', () => {
    vi.spyOn(queueHooks, 'useFeedQueueStats').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    } as ReturnType<typeof queueHooks.useFeedQueueStats>);
    const { container } = render(<FeedQueueStatsStrip />);
    expect(container).toBeEmptyDOMElement();
    vi.restoreAllMocks();
  });
});
