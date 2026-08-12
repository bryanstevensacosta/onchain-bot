// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';

import {
  AdsManager,
  formatExpiresIn,
  isoToLocalInput,
  localInputToIso,
} from './ads-manager';
import type { AdView, MediaLibraryView } from '../api/ads-api';

afterEach(cleanup);

function makeAd(overrides: Partial<AdView> = {}): AdView {
  return {
    id: 'ad-1',
    name: 'Pump alpha',
    body: 'Something good',
    imageMediaId: null,
    enabled: true,
    order: 0,
    timesPublished: 0,
    consecutiveFailures: 0,
    lastPublishedAt: null,
    expiresAt: null,
    expirationAction: 'disable',
    createdAt: new Date('2026-08-03').toISOString(),
    updatedAt: new Date('2026-08-03').toISOString(),
    ...overrides,
  };
}

function makeLib(
  id: string,
  originalFileName: string | null,
): MediaLibraryView {
  return {
    id,
    url: `/crypto-news-ads/media-library/${id}`,
    originalFileName,
    mimeType: originalFileName ? 'image/png' : null,
    fileSize: originalFileName ? 1024 : null,
    createdAt: new Date('2026-08-03').toISOString(),
  };
}

const updateAdMock = vi.fn();
const reuseMutMock = vi.fn();

vi.mock('@/features/crypto-news-ads/model/use-ads', () => ({
  useAds: vi.fn(),
  useCreateAd: vi.fn(),
  useUpdateAd: vi.fn(),
  useDeleteAd: vi.fn(),
  useUploadAdImage: vi.fn(),
  useClearAdImage: vi.fn(),
  useMediaLibrary: vi.fn(),
  useReuseLibraryImage: vi.fn(),
}));

import {
  useAds,
  useClearAdImage,
  useCreateAd,
  useDeleteAd,
  useMediaLibrary,
  useReuseLibraryImage,
  useUpdateAd,
  useUploadAdImage,
} from '@/features/crypto-news-ads/model/use-ads';

const mockedUseAds = vi.mocked(useAds);
const mockedUseCreateAd = vi.mocked(useCreateAd);
const mockedUseUpdateAd = vi.mocked(useUpdateAd);
const mockedUseDeleteAd = vi.mocked(useDeleteAd);
const mockedUseUploadAdImage = vi.mocked(useUploadAdImage);
const mockedUseClearAdImage = vi.mocked(useClearAdImage);
const mockedUseMediaLibrary = vi.mocked(useMediaLibrary);
const mockedUseReuseLibraryImage = vi.mocked(useReuseLibraryImage);

describe('AdsManager', () => {
  beforeEach(() => {
    updateAdMock.mockReset();
    reuseMutMock.mockReset();
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
    mockedUseUploadAdImage.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    mockedUseClearAdImage.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    mockedUseReuseLibraryImage.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: reuseMutMock,
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
      { name: 'New banner', body: 'Buy now', expirationAction: 'disable' },
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

  it('moves an ad up by swapping order values with its neighbor', () => {
    mockedUseAds.mockReturnValue({
      data: [
        makeAd({ id: 'ad-first', name: 'First', order: 0 }),
        makeAd({ id: 'ad-second', name: 'Second', order: 1 }),
      ],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByLabelText('Move Second up'));
    expect(updateAdMock).toHaveBeenCalledWith({
      id: 'ad-second',
      patch: { order: 0 },
    });
    expect(updateAdMock).toHaveBeenCalledWith({
      id: 'ad-first',
      patch: { order: 1 },
    });
  });

  it('moves an ad down by swapping order values with its neighbor', () => {
    mockedUseAds.mockReturnValue({
      data: [
        makeAd({ id: 'ad-first', name: 'First', order: 0 }),
        makeAd({ id: 'ad-second', name: 'Second', order: 1 }),
      ],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByLabelText('Move First down'));
    expect(updateAdMock).toHaveBeenCalledWith({
      id: 'ad-first',
      patch: { order: 1 },
    });
    expect(updateAdMock).toHaveBeenCalledWith({
      id: 'ad-second',
      patch: { order: 0 },
    });
  });

  it('disables move buttons at the list edges', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ id: 'ad-only', name: 'Only', order: 0 })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    expect(screen.getByLabelText('Move Only up')).toBeDisabled();
    expect(screen.getByLabelText('Move Only down')).toBeDisabled();
  });

  it('shows expiry fields in the create modal', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));
    expect(screen.getByLabelText('Expires at')).toBeInTheDocument();
    expect(screen.getByLabelText('On expiry')).toBeInTheDocument();
  });

  it('submits expiry fields when set in the create modal', () => {
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
    fireEvent.change(screen.getByLabelText('Expires at'), {
      target: { value: '2026-08-10T12:00' },
    });
    fireEvent.change(screen.getByLabelText('On expiry'), {
      target: { value: 'delete' },
    });
    fireEvent.click(screen.getByText('Save'));

    expect(createMut).toHaveBeenCalledWith(
      {
        name: 'New banner',
        body: 'Buy now',
        expiresAt: localInputToIso('2026-08-10T12:00'),
        expirationAction: 'delete',
      },
      expect.anything(),
    );
  });

  it('pre-fills the edit modal with the ad expiry', () => {
    mockedUseAds.mockReturnValue({
      data: [
        makeAd({
          expiresAt: '2026-08-10T12:00:00.000Z',
          expirationAction: 'delete',
        }),
      ],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByLabelText('Expires at')).toHaveValue(
      isoToLocalInput('2026-08-10T12:00:00.000Z'),
    );
    expect(screen.getByLabelText('On expiry')).toHaveValue('delete');
  });

  it('submits an empty expiry on edit as null', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ expiresAt: '2026-08-10T12:00:00.000Z' })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Expires at'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByText('Save'));
    expect(updateAdMock).toHaveBeenCalledWith(
      { id: 'ad-1', patch: expect.objectContaining({ expiresAt: null }) },
      expect.anything(),
    );
  });

  it('shows an expired badge for an ad past its expiry', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ expiresAt: '2026-01-01T00:00:00.000Z' })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    expect(screen.getByText('expired')).toBeInTheDocument();
  });

  it('shows "no limit" when the ad never expires', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ expiresAt: null })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    expect(screen.getByText('no limit')).toBeInTheDocument();
  });

  it('uploads a selected file via the row file input', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    const uploadMut = vi.fn();
    mockedUseUploadAdImage.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: uploadMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    const { container } = render(<AdsManager />);
    const file = new File(['banner'], 'banner.png', { type: 'image/png' });
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { files: [file] } });

    expect(uploadMut).toHaveBeenCalledWith({ adId: 'ad-1', file });
  });

  it('renders a preview image when imageMediaId is set', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ imageMediaId: 'media-1' })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    const img = screen.getByAltText('Pump alpha image');
    expect(img).toHaveAttribute('src', '/crypto-news-ads/media/media-1');
  });

  it('removes the image via clearAdImage after confirmation', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ imageMediaId: 'media-1' })],
      isLoading: false,
      error: null,
    } as never);
    const clearMut = vi.fn();
    mockedUseClearAdImage.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: clearMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('Remove'));

    expect(clearMut).toHaveBeenCalledWith('ad-1');
    confirmSpy.mockRestore();
  });

  it('does not remove the image when confirmation is dismissed', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ imageMediaId: 'media-1' })],
      isLoading: false,
      error: null,
    } as never);
    const clearMut = vi.fn();
    mockedUseClearAdImage.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: clearMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('Remove'));

    expect(clearMut).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows an inline error when the upload fails and keeps the upload state', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    mockedUseUploadAdImage.mockReturnValue({
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error('upload failed'),
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    const { container } = render(<AdsManager />);
    expect(screen.getByText('upload failed')).toBeInTheDocument();
    expect(screen.getByText('Upload image')).toBeInTheDocument();
    expect(screen.queryByAltText('Pump alpha image')).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('renders the create modal without any image field', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    const { container } = render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();
    expect(modalCard.querySelector('input[type="file"]')).toBeNull();
    expect(modalCard.querySelector('#ad-image-path')).toBeNull();
    expect(within(modalCard).getByLabelText(/Name/)).toBeInTheDocument();
    expect(within(modalCard).getByLabelText(/Body/)).toBeInTheDocument();
    expect(within(modalCard).getByLabelText('Expires at')).toBeInTheDocument();
    expect(within(modalCard).getByLabelText('On expiry')).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('renders the edit modal without any image field', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByText('Edit'));

    const modalCard = screen
      .getByText('Edit Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();
    expect(modalCard.querySelector('input[type="file"]')).toBeNull();
    expect(modalCard.querySelector('#ad-image-path')).toBeNull();
    expect(within(modalCard).getByLabelText(/Name/)).toBeInTheDocument();
    expect(within(modalCard).getByLabelText(/Body/)).toBeInTheDocument();
  });

  it('offers Reuse and Upload in both image states, Remove only with an image', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    const { rerender } = render(<AdsManager />);
    expect(screen.getByText('Reuse')).toBeInTheDocument();
    expect(screen.getByText('Upload image')).toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();

    mockedUseAds.mockReturnValue({
      data: [makeAd({ imageMediaId: 'media-1' })],
      isLoading: false,
      error: null,
    } as never);
    rerender(<AdsManager />);
    expect(screen.getByText('Reuse')).toBeInTheDocument();
    expect(screen.getByText('Upload image')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('shows library thumbnails in the reuse modal', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: [makeLib('lib-1', 'banner.png'), makeLib('lib-2', null)],
      isLoading: false,
      error: null,
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('Reuse'));

    expect(screen.getByText('Reuse existing image')).toBeInTheDocument();
    expect(screen.getByAltText('banner.png')).toHaveAttribute(
      'src',
      '/crypto-news-ads/media-library/lib-1',
    );
    expect(screen.getByAltText('lib-2')).toHaveAttribute(
      'src',
      '/crypto-news-ads/media-library/lib-2',
    );
    // caption under each thumbnail
    expect(screen.getByText('banner.png')).toBeInTheDocument();
    expect(screen.getByText('lib-2')).toBeInTheDocument();
  });

  it('reuses a library image when a thumbnail is clicked', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: [makeLib('lib-1', 'banner.png')],
      isLoading: false,
      error: null,
    } as never);
    const reuseMut = vi.fn();
    mockedUseReuseLibraryImage.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: reuseMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('Reuse'));
    fireEvent.click(screen.getByAltText('banner.png'));

    expect(reuseMut).toHaveBeenCalledWith({
      adId: 'ad-1',
      libraryMediaId: 'lib-1',
    });
  });

  it('shows the library empty state in the reuse modal', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('Reuse'));

    expect(
      screen.getByText('Library is empty — upload an image first.'),
    ).toBeInTheDocument();
  });

  it('shows a red library error in the reuse modal with no grid', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('library boom'),
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('Reuse'));

    expect(screen.getByText('library boom')).toHaveClass('text-red-400');
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('shows a reuse mutation error in the inline error banner', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    mockedUseReuseLibraryImage.mockReturnValue({
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error('reuse failed'),
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    render(<AdsManager />);
    expect(screen.getByText('reuse failed')).toBeInTheDocument();
  });

  it('closes the reuse modal after a successful reuse', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: [makeLib('lib-1', 'banner.png')],
      isLoading: false,
      error: null,
    } as never);
    const reuseMut = vi.fn();
    mockedUseReuseLibraryImage.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: reuseMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    const { rerender } = render(<AdsManager />);
    fireEvent.click(screen.getByText('Reuse'));
    expect(screen.getByText('Reuse existing image')).toBeInTheDocument();

    fireEvent.click(screen.getByAltText('banner.png'));
    mockedUseReuseLibraryImage.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
      mutate: reuseMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    rerender(<AdsManager />);

    expect(screen.queryByText('Reuse existing image')).not.toBeInTheDocument();
  });
});

describe('formatExpiresIn', () => {
  const NOW = new Date('2026-08-06T12:00:00.000Z');

  it('returns "no limit" for null expiry', () => {
    expect(formatExpiresIn(null, NOW)).toBe('no limit');
  });

  it('returns "expired" for an expiry at or before now', () => {
    expect(formatExpiresIn('2026-08-06T12:00:00.000Z', NOW)).toBe('expired');
    expect(formatExpiresIn('2026-08-05T12:00:00.000Z', NOW)).toBe('expired');
  });

  it('formats > 24h as "in Xd Yh"', () => {
    expect(formatExpiresIn('2026-08-07T13:30:00.000Z', NOW)).toBe('in 1d 1h');
  });

  it('formats > 1h as "in Xh Ym"', () => {
    expect(formatExpiresIn('2026-08-06T15:45:00.000Z', NOW)).toBe('in 3h 45m');
  });

  it('formats <= 1h as "in Xm"', () => {
    expect(formatExpiresIn('2026-08-06T12:30:00.000Z', NOW)).toBe('in 30m');
  });
});

describe('iso/local conversion helpers', () => {
  it('round-trips a local input through ISO', () => {
    const local = isoToLocalInput('2026-08-06T12:00:00.000Z');
    const iso = localInputToIso(local);
    expect(iso).not.toBeNull();
    expect(isoToLocalInput(iso!)).toBe(local);
  });

  it('returns null for an empty or invalid local input', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('not-a-date')).toBeNull();
  });

  it('returns an empty string for an invalid ISO', () => {
    expect(isoToLocalInput('not-a-date')).toBe('');
  });
});
