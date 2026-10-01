// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FeedThreadsStubSection } from './feed-threads-stub-section';
import * as stubHook from '@/features/feed-publisher/model/use-threads-stub';

function mockStatus(
  result: Partial<ReturnType<typeof stubHook.useFeedThreadsStatus>>,
) {
  vi.spyOn(stubHook, 'useFeedThreadsStatus').mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    ...result,
  } as ReturnType<typeof stubHook.useFeedThreadsStatus>);
}

describe('FeedThreadsStubSection', () => {
  it('renders the deferred-to-v2 notice on the 501 stub body', () => {
    mockStatus({
      data: { error: 'THREADS_NOT_IMPLEMENTED', message: 'deferred to v2' },
    });
    render(<FeedThreadsStubSection />);
    expect(screen.getByTestId('feed-threads-stub')).toBeInTheDocument();
    expect(screen.getByText('Threads deferred to v2')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('renders the empty-state when the API is down', () => {
    mockStatus({ error: new Error('boom') });
    render(<FeedThreadsStubSection />);
    expect(screen.getByTestId('feed-threads-empty')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
