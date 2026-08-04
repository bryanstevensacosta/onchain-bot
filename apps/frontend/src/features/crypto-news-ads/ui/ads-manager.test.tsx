// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AdsManager } from './ads-manager';
import type { AdView } from '../api/ads-api';

afterEach(cleanup);

function makeAd(overrides: Partial<AdView> = {}): AdView {
  return {
    id: 'ad-1',
    name: 'Pump alpha',
    body: 'Something good',
    imagePath: null,
    enabled: true,
    order: 0,
    timesPublished: 0,
    consecutiveFailures: 0,
    lastPublishedAt: null,
    createdAt: new Date('2026-08-03').toISOString(),
    updatedAt: new Date('2026-08-03').toISOString(),
    ...overrides,
  };
}

const updateAdMock = vi.fn();

vi.mock('@/features/crypto-news-ads/model/use-ads', () => ({
  useAds: vi.fn(),
  useCreateAd: vi.fn(),
  useUpdateAd: vi.fn(),
  useDeleteAd: vi.fn(),
}));

import {
  useAds,
  useCreateAd,
  useDeleteAd,
  useUpdateAd,
} from '@/features/crypto-news-ads/model/use-ads';

const mockedUseAds = vi.mocked(useAds);
const mockedUseCreateAd = vi.mocked(useCreateAd);
const mockedUseUpdateAd = vi.mocked(useUpdateAd);
const mockedUseDeleteAd = vi.mocked(useDeleteAd);

describe('AdsManager', () => {
  beforeEach(() => {
    updateAdMock.mockReset();
    mockedUseCreateAd.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    mockedUseUpdateAd.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: updateAdMock,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    mockedUseDeleteAd.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
  });

  it('renders the ad list from the mocked query', () => {
    mockedUseAds.mockReturnValue({
      data: [
        makeAd({ name: 'Alpha' }),
        makeAd({ id: 'ad-2', name: 'Bravo', order: 1 }),
      ],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('shows an error state when the query rejects', () => {
    mockedUseAds.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    } as never);
    render(<AdsManager />);
    expect(screen.getByText(/Failed to load ads/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no ads', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    expect(screen.getByText(/No ads yet/)).toBeInTheDocument();
  });

  it('opens the create modal and submits name/body', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    const createMut = vi.fn();
    mockedUseCreateAd.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: createMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'New banner' },
    });
    fireEvent.change(screen.getByLabelText(/Body/), {
      target: { value: 'Buy now' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(createMut).toHaveBeenCalledWith(
      { name: 'New banner', body: 'Buy now' },
      expect.anything(),
    );
  });

  it('toggles enabled via updateAd', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ enabled: true })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByLabelText('Toggle Pump alpha'));
    expect(updateAdMock).toHaveBeenCalledWith({
      id: 'ad-1',
      patch: { enabled: false },
    });
  });

  it('moves an ad up via updateAd order patch', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ name: 'First', order: 0 }), makeAd({ order: 1 })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByLabelText('Move Pump alpha up'));
    expect(updateAdMock).toHaveBeenCalledWith({
      id: 'ad-1',
      patch: { order: 0 },
    });
  });

  it('moves an ad down via updateAd order patch', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ order: 0 }), makeAd({ name: 'Last', order: 1 })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByLabelText('Move Pump alpha down'));
    expect(updateAdMock).toHaveBeenCalledWith({
      id: 'ad-1',
      patch: { order: 1 },
    });
  });
});
