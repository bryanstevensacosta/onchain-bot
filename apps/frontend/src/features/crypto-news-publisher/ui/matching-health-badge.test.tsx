// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { MatchingHealthBadge } from './matching-health-badge';
import type { MatchingHealth } from '../api/llm-config-api';

const { useMatchingHealthMock } = vi.hoisted(() => ({
  useMatchingHealthMock: vi.fn(),
}));

vi.mock('@/features/crypto-news-publisher/model/use-llm-config', () => ({
  useMatchingHealth: useMatchingHealthMock,
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function healthy(overrides: Partial<MatchingHealth> = {}): MatchingHealth {
  return {
    enabled: true,
    lastTickAt: new Date(Date.now() - 30_000).toISOString(),
    lastFetchOk: true,
    consecutiveFetchFailures: 0,
    lastEnqueuedAt: null,
    queuePending: 0,
    ...overrides,
  };
}

describe('MatchingHealthBadge', () => {
  it('renders LOADING skeleton while the query is pending', () => {
    useMatchingHealthMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<MatchingHealthBadge />);
    expect(screen.getByTestId('matching-health-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('matching-health-on')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('matching-health-unknown'),
    ).not.toBeInTheDocument();
  });

  it('renders green ON with relative lastTickAt when healthy and enabled', () => {
    useMatchingHealthMock.mockReturnValue({
      data: healthy(),
      isLoading: false,
      isError: false,
    });
    render(<MatchingHealthBadge />);
    const badge = screen.getByTestId('matching-health-on');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('ON');
    expect(badge.textContent ?? '').toMatch(/hace /);
  });

  it('renders gray UNKNOWN without crashing on query error (old-backend 404)', () => {
    useMatchingHealthMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<MatchingHealthBadge />);
    const badge = screen.getByTestId('matching-health-unknown');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('UNKNOWN');
    expect(screen.queryByTestId('matching-health-on')).not.toBeInTheDocument();
    expect(screen.queryByTestId('matching-health-off')).not.toBeInTheDocument();
  });

  it('renders gray UNKNOWN with failure count tooltip when fetches fail', () => {
    useMatchingHealthMock.mockReturnValue({
      data: healthy({ consecutiveFetchFailures: 3, lastFetchOk: false }),
      isLoading: false,
      isError: false,
    });
    render(<MatchingHealthBadge />);
    const badge = screen.getByTestId('matching-health-unknown');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('title') ?? '').toContain(
      'consecutiveFetchFailures: 3',
    );
  });

  it('renders green ON when lastFetchOk is null (fresh backend, never fetched)', () => {
    useMatchingHealthMock.mockReturnValue({
      data: healthy({ lastFetchOk: null, consecutiveFetchFailures: 0 }),
      isLoading: false,
      isError: false,
    });
    render(<MatchingHealthBadge />);
    const badge = screen.getByTestId('matching-health-on');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('ON');
  });

  it('renders red OFF when enabled=false', () => {
    useMatchingHealthMock.mockReturnValue({
      data: healthy({ enabled: false }),
      isLoading: false,
      isError: false,
    });
    render(<MatchingHealthBadge />);
    const badge = screen.getByTestId('matching-health-off');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('OFF');
    expect(
      screen.queryByTestId('matching-health-unknown'),
    ).not.toBeInTheDocument();
  });
});
