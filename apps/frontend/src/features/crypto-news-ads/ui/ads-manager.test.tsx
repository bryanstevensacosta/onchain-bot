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
  isoToUtcInput,
  utcInputToIso,
} from './ads-manager';
import type { AdView, MediaLibraryView } from '../api/ads-api';

afterEach(cleanup);

function makeAd(overrides: Partial<AdView> = {}): AdView {
  return {
    id: 'ad-1',
    name: 'Pump alpha',
    body: 'Something good',
    imageMediaId: null,
    format: 'text',
    videoMediaId: null,
    albumMediaIds: null,
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
const publishNowMutMock = vi.fn();

vi.mock('@/features/crypto-news-ads/model/use-ads', () => ({
  useAds: vi.fn(),
  useCreateAd: vi.fn(),
  useUpdateAd: vi.fn(),
  useDeleteAd: vi.fn(),
  useUploadAdImage: vi.fn(),
  useUploadAdVideo: vi.fn(),
  useClearAdImage: vi.fn(),
  useMediaLibrary: vi.fn(),
  usePublishAdNow: vi.fn(),
  useReuseLibraryImage: vi.fn(),
  useReuseLibraryImages: vi.fn(),
}));

import {
  useAds,
  useClearAdImage,
  useCreateAd,
  useDeleteAd,
  useMediaLibrary,
  usePublishAdNow,
  useReuseLibraryImage,
  useReuseLibraryImages,
  useUpdateAd,
  useUploadAdImage,
  useUploadAdVideo,
} from '@/features/crypto-news-ads/model/use-ads';

const mockedUseAds = vi.mocked(useAds);
const mockedUseCreateAd = vi.mocked(useCreateAd);
const mockedUseUpdateAd = vi.mocked(useUpdateAd);
const mockedUseDeleteAd = vi.mocked(useDeleteAd);
const mockedUseUploadAdImage = vi.mocked(useUploadAdImage);
const mockedUseUploadAdVideo = vi.mocked(useUploadAdVideo);
const mockedUseClearAdImage = vi.mocked(useClearAdImage);
const mockedUseMediaLibrary = vi.mocked(useMediaLibrary);
const mockedUsePublishAdNow = vi.mocked(usePublishAdNow);
const mockedUseReuseLibraryImage = vi.mocked(useReuseLibraryImage);
const mockedUseReuseLibraryImages = vi.mocked(useReuseLibraryImages);

describe('AdsManager', () => {
  beforeEach(() => {
    updateAdMock.mockReset();
    reuseMutMock.mockReset();
    publishNowMutMock.mockReset();
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
    mockedUseUploadAdVideo.mockReturnValue({
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
    mockedUsePublishAdNow.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
      variables: undefined,
      mutate: publishNowMutMock,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
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
    mockedUseReuseLibraryImages.mockReturnValue({
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
      { name: 'New banner', body: 'Buy now', expirationAction: 'disable' },
      expect.anything(),
    );
  });

  it('add ad modal only closes via the × button (not backdrop or Escape)', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    // Backdrop click does NOT close the modal.
    const backdrop = document.body.querySelector(
      '.fixed.inset-0.z-50',
    ) as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(screen.getByText('Add Ad')).toBeInTheDocument();

    // Escape does NOT close the modal.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('Add Ad')).toBeInTheDocument();

    // The × button still closes it.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Add Ad')).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('Expires at (UTC)')).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Expires at (UTC)'), {
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
        expiresAt: '2026-08-10T12:00:00Z',
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
    expect(screen.getByLabelText('Expires at (UTC)')).toHaveValue(
      '2026-08-10T12:00',
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
    fireEvent.change(screen.getByLabelText('Expires at (UTC)'), {
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
      data: [makeAd({ format: 'photo' })],
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
      data: [makeAd({ imageMediaId: 'media-1', format: 'photo' })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    const img = screen.getByAltText('Pump alpha image');
    expect(img).toHaveAttribute('src', '/crypto-news-ads/media/media-1');
  });

  it('removes the image via clearAdImage after confirmation', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ imageMediaId: 'media-1', format: 'photo' })],
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
      data: [makeAd({ imageMediaId: 'media-1', format: 'photo' })],
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

  it('sends the ad to Telegram now after confirmation', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('Send now'));

    expect(publishNowMutMock).toHaveBeenCalledWith('ad-1');
    confirmSpy.mockRestore();
  });

  it('does not send the ad when the confirmation is dismissed', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('Send now'));

    expect(publishNowMutMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows inline confirmation only on the published row', () => {
    mockedUseAds.mockReturnValue({
      data: [
        makeAd({ id: 'ad-1', name: 'Alpha', order: 0 }),
        makeAd({ id: 'ad-2', name: 'Bravo', order: 1 }),
      ],
      isLoading: false,
      error: null,
    } as never);
    mockedUsePublishAdNow.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
      data: { ok: true, messageId: 42, error: null },
      variables: 'ad-1',
      mutate: publishNowMutMock,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    render(<AdsManager />);
    expect(screen.getByText('Sent (msg 42)')).toBeInTheDocument();
    const rowAlpha = screen.getByText('Alpha').closest('tr') as HTMLElement;
    expect(rowAlpha).not.toBeNull();
    expect(within(rowAlpha).getByText('Sent (msg 42)')).toBeInTheDocument();
    const rowBravo = screen.getByText('Bravo').closest('tr') as HTMLElement;
    expect(rowBravo).not.toBeNull();
    expect(
      within(rowBravo).queryByText('Sent (msg 42)'),
    ).not.toBeInTheDocument();
  });

  it('shows the send failure message when publish-now returns ok:false', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    mockedUsePublishAdNow.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
      data: { ok: false, messageId: null, error: 'bot offline' },
      variables: 'ad-1',
      mutate: publishNowMutMock,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    render(<AdsManager />);
    expect(screen.getByText('bot offline')).toBeInTheDocument();
  });

  it('shows the transport error message when the publish request throws', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    mockedUsePublishAdNow.mockReturnValue({
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error('network down'),
      data: undefined,
      variables: 'ad-1',
      mutate: publishNowMutMock,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    render(<AdsManager />);
    expect(screen.getByText('network down')).toBeInTheDocument();
  });

  it('disables Send now on every row while a publish is pending', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    mockedUsePublishAdNow.mockReturnValue({
      isPending: true,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
      variables: 'ad-1',
      mutate: publishNowMutMock,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    render(<AdsManager />);
    expect(screen.getByText('Send now')).toBeDisabled();
  });

  it('shows an inline error when the upload fails and keeps the upload state', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ format: 'photo' })],
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

  it('renders create modal; image controls appear for photo', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();

    expect(within(modalCard).queryByTestId('ad-image-file-input')).toBeNull();
    expect(
      within(modalCard).queryByRole('button', {
        name: /Toggle library picker/i,
      }),
    ).toBeNull();

    fireEvent.click(within(modalCard).getByRole('button', { name: /🖼 Foto/ }));

    expect(
      within(modalCard).getByTestId('ad-image-file-input'),
    ).toBeInTheDocument();
    expect(
      within(modalCard).getByRole('button', { name: /Toggle library picker/i }),
    ).toBeInTheDocument();
    expect(screen.queryByAltText(/current ad image/i)).toBeNull();
  });

  it('renders the edit modal with image controls when an image exists', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ imageMediaId: 'media-1', format: 'photo' })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByText('Edit'));

    const modalCard = screen
      .getByText('Edit Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();
    expect(
      within(modalCard).getByTestId('ad-image-file-input'),
    ).toBeInTheDocument();
    expect(
      within(modalCard).getByRole('button', { name: /Toggle library picker/i }),
    ).toBeInTheDocument();
    const currentImage = within(modalCard).getByAltText(
      'Current ad image',
    ) as HTMLImageElement;
    expect(currentImage).toHaveAttribute(
      'src',
      '/crypto-news-ads/media/media-1',
    );
  });

  it('offers Reuse and Upload in both image states, Remove only with an image', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ format: 'photo' })],
      isLoading: false,
      error: null,
    } as never);
    const { rerender } = render(<AdsManager />);
    expect(screen.getByText('Reuse')).toBeInTheDocument();
    expect(screen.getByText('Upload image')).toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();

    mockedUseAds.mockReturnValue({
      data: [makeAd({ imageMediaId: 'media-1', format: 'photo' })],
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
      data: [makeAd({ format: 'photo' })],
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
      data: [makeAd({ format: 'photo' })],
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
      data: [makeAd({ format: 'photo' })],
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
      data: [makeAd({ format: 'photo' })],
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
      data: [makeAd({ format: 'photo' })],
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
      data: [makeAd({ format: 'photo' })],
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

  it('creates an ad and uploads the staged file', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    const createMut = vi.fn(
      (_body: unknown, opts?: { onSuccess?: (created: AdView) => void }) => {
        opts?.onSuccess?.(makeAd({ id: 'new-ad' }));
      },
    );
    mockedUseCreateAd.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: createMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
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

    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'New banner' },
    });
    fireEvent.change(screen.getByLabelText(/Body/), {
      target: { value: 'Buy now' },
    });
    fireEvent.click(within(modalCard).getByRole('button', { name: /🖼 Foto/ }));

    const file = new File(['x'], 'banner.png', { type: 'image/png' });
    const fileInput = within(modalCard).getByTestId(
      'ad-image-file-input',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText('Save'));

    expect(createMut).toHaveBeenCalledWith(
      { name: 'New banner', body: 'Buy now', expirationAction: 'disable' },
      expect.anything(),
    );
    expect(uploadMut).toHaveBeenCalledWith(
      { adId: 'new-ad', file },
      expect.anything(),
    );
  });

  it('creates an ad and reuses a library image', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: [makeLib('lib-1', 'banner.png')],
      isLoading: false,
      error: null,
    } as never);
    const createMut = vi.fn(
      (_body: unknown, opts?: { onSuccess?: (created: AdView) => void }) => {
        opts?.onSuccess?.(makeAd({ id: 'new-ad' }));
      },
    );
    mockedUseCreateAd.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: createMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
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
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'New banner' },
    });
    fireEvent.change(screen.getByLabelText(/Body/), {
      target: { value: 'Buy now' },
    });
    fireEvent.click(within(modalCard).getByRole('button', { name: /🖼 Foto/ }));

    fireEvent.click(
      within(modalCard).getByRole('button', {
        name: /Toggle library picker/i,
      }),
    );
    expect(within(modalCard).getByAltText('banner.png')).toBeInTheDocument();

    fireEvent.click(within(modalCard).getByAltText('banner.png'));
    fireEvent.click(screen.getByText('Save'));

    expect(createMut).toHaveBeenCalledWith(
      { name: 'New banner', body: 'Buy now', expirationAction: 'disable' },
      expect.anything(),
    );
    expect(reuseMut).toHaveBeenCalledWith(
      {
        adId: 'new-ad',
        libraryMediaId: 'lib-1',
      },
      expect.anything(),
    );
  });

  it('edits an ad and replaces its image via upload', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ imageMediaId: 'media-1', format: 'photo' })],
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
    updateAdMock.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: (updated: AdView) => void }) => {
        opts?.onSuccess?.(
          makeAd({
            id: 'ad-1',
            imageMediaId: 'media-1',
            format: 'photo',
            name: 'Renamed',
          }),
        );
      },
    );

    render(<AdsManager />);
    fireEvent.click(screen.getByText('Edit'));

    const modalCard = screen
      .getByText('Edit Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'Renamed' },
    });

    const file = new File(['x'], 'banner.png', { type: 'image/png' });
    const fileInput = within(modalCard).getByTestId(
      'ad-image-file-input',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText('Save'));

    expect(updateAdMock).toHaveBeenCalledWith(
      {
        id: 'ad-1',
        patch: {
          name: 'Renamed',
          body: 'Something good',
          expiresAt: null,
          expirationAction: 'disable',
        },
      },
      expect.anything(),
    );
    const updateCall = updateAdMock.mock.calls.find(
      (call) =>
        (call[0] as { id: string }).id === 'ad-1' &&
        (call[0] as { patch: { image?: unknown } }).patch.image === undefined,
    );
    expect(updateCall).toBeDefined();
    expect(uploadMut).toHaveBeenCalledWith(
      { adId: 'ad-1', file },
      expect.anything(),
    );
  });

  it('image upload failure after create surfaces error on the new row', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    const createMut = vi.fn(
      (_body: unknown, opts?: { onSuccess?: (created: AdView) => void }) => {
        opts?.onSuccess?.(makeAd({ id: 'new-ad' }));
      },
    );
    mockedUseCreateAd.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: createMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    const uploadMut = vi.fn(
      (_args: unknown, opts?: { onError?: (err: Error) => void }) => {
        opts?.onError?.(new Error('upload failed'));
      },
    );
    mockedUseUploadAdImage.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: uploadMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);

    const { rerender } = render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'New banner' },
    });
    fireEvent.change(screen.getByLabelText(/Body/), {
      target: { value: 'Buy now' },
    });
    fireEvent.click(within(modalCard).getByRole('button', { name: /🖼 Foto/ }));
    const file = new File(['x'], 'banner.png', { type: 'image/png' });
    const fileInput = within(modalCard).getByTestId(
      'ad-image-file-input',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText('Save'));

    expect(uploadMut).toHaveBeenCalled();

    mockedUseAds.mockReturnValue({
      data: [
        makeAd({
          id: 'new-ad',
          name: 'New banner',
          format: 'photo',
        }),
      ],
      isLoading: false,
      error: null,
    } as never);
    rerender(<AdsManager />);

    expect(screen.getByText('New banner')).toBeInTheDocument();
    expect(screen.getByText('upload failed')).toBeInTheDocument();
  });

  it('row image buttons are disabled while modal is open', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ format: 'photo' })],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);

    const row = screen.getByText('Pump alpha').closest('tr') as HTMLElement;
    expect(row).not.toBeNull();
    const rowScope = within(row);

    expect(rowScope.getByText('Upload image')).not.toBeDisabled();
    expect(rowScope.getByText('Reuse')).not.toBeDisabled();

    fireEvent.click(screen.getByText('+ Add Ad'));

    expect(rowScope.getByText('Upload image')).toBeDisabled();
    expect(rowScope.getByText('Reuse')).toBeDisabled();
  });

  it('save button label differentiates during phases', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    mockedUseCreateAd.mockReturnValue({
      isPending: true,
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

    const { rerender } = render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    expect(screen.getByText('Creating…')).toBeInTheDocument();

    mockedUseCreateAd.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    mockedUseUploadAdImage.mockReturnValue({
      isPending: true,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    rerender(<AdsManager />);

    expect(screen.getByText('Uploading image…')).toBeInTheDocument();
  });

  it('picker toggles open and closed via the toggle button', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: [makeLib('lib-1', 'banner.png')],
      isLoading: false,
      error: null,
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();

    fireEvent.click(within(modalCard).getByRole('button', { name: /🖼 Foto/ }));

    expect(within(modalCard).queryByAltText('banner.png')).toBeNull();

    const toggle = within(modalCard).getByRole('button', {
      name: /Toggle library picker/i,
    });
    expect(toggle).toHaveTextContent('Pick from library');

    fireEvent.click(toggle);
    expect(within(modalCard).getByAltText('banner.png')).toBeInTheDocument();
    expect(toggle).toHaveTextContent('Hide library');

    fireEvent.click(toggle);
    expect(within(modalCard).queryByAltText('banner.png')).toBeNull();
    expect(toggle).toHaveTextContent('Pick from library');
  });

  it('shows format-specific controls when switching the format selector', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: [makeLib('lib-1', 'banner.png')],
      isLoading: false,
      error: null,
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();

    expect(within(modalCard).queryByTestId('ad-image-file-input')).toBeNull();
    expect(within(modalCard).queryByTestId('ad-video-file-input')).toBeNull();
    expect(within(modalCard).queryByText('Album images')).toBeNull();

    fireEvent.click(
      within(modalCard).getByRole('button', { name: /🎬 Video/ }),
    );
    expect(
      within(modalCard).getByTestId('ad-video-file-input'),
    ).toBeInTheDocument();
    expect(within(modalCard).queryByTestId('ad-image-file-input')).toBeNull();

    fireEvent.click(
      within(modalCard).getByRole('button', { name: /🗂 Álbum/ }),
    );
    expect(within(modalCard).getByText('Album images')).toBeInTheDocument();
    expect(
      within(modalCard).getByLabelText('Select banner.png for album'),
    ).toBeInTheDocument();
    expect(within(modalCard).queryByTestId('ad-video-file-input')).toBeNull();

    fireEvent.click(within(modalCard).getByRole('button', { name: /🖼 Foto/ }));
    expect(
      within(modalCard).getByTestId('ad-image-file-input'),
    ).toBeInTheDocument();
    expect(within(modalCard).queryByTestId('ad-video-file-input')).toBeNull();
  });

  it('renders no image controls for a text ad row', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd()],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    expect(screen.queryByText('Upload image')).toBeNull();
    expect(screen.queryByText('Reuse')).toBeNull();
    expect(screen.queryByText('Remove')).toBeNull();
    expect(screen.queryByAltText('Pump alpha image')).toBeNull();
  });

  it('renders no image picker in the create modal for text format', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();
    expect(within(modalCard).queryByTestId('ad-image-file-input')).toBeNull();
    expect(
      within(modalCard).queryByRole('button', {
        name: /Toggle library picker/i,
      }),
    ).toBeNull();
  });

  it('renders the formatting toolbar for every format in the modal', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();

    const toolbarTitles = [
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Spoiler',
      'Inline code',
      'Preformatted block',
      'Blockquote',
      'Link',
    ];
    const expectToolbar = () => {
      for (const title of toolbarTitles) {
        expect(within(modalCard).getByTitle(title)).toBeInTheDocument();
      }
    };

    expectToolbar();
    for (const formatLabel of [/🖼 Foto/, /🎬 Video/, /🗂 Álbum/]) {
      fireEvent.click(
        within(modalCard).getByRole('button', { name: formatLabel }),
      );
      expectToolbar();
    }
  });

  it('creates a video ad via upload then patches the format in order', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-video');
    URL.revokeObjectURL = vi.fn();
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    const callOrder: string[] = [];
    const createMut = vi.fn(
      (_body: unknown, opts?: { onSuccess?: (created: AdView) => void }) => {
        callOrder.push('create');
        opts?.onSuccess?.(makeAd({ id: 'new-ad' }));
      },
    );
    mockedUseCreateAd.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: createMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    const uploadVideoMut = vi.fn(
      (_args: unknown, opts?: { onSuccess?: (updated: AdView) => void }) => {
        callOrder.push('uploadVideo');
        opts?.onSuccess?.(makeAd({ id: 'new-ad', videoMediaId: 'media-v' }));
      },
    );
    mockedUseUploadAdVideo.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: uploadVideoMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    updateAdMock.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: (updated: AdView) => void }) => {
        callOrder.push('patchFormat');
        opts?.onSuccess?.(makeAd({ id: 'new-ad', format: 'video' }));
      },
    );

    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'Video banner' },
    });
    fireEvent.change(screen.getByLabelText(/Body/), {
      target: { value: 'Watch now' },
    });

    fireEvent.click(
      within(modalCard).getByRole('button', { name: /🎬 Video/ }),
    );
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    const videoInput = within(modalCard).getByTestId(
      'ad-video-file-input',
    ) as HTMLInputElement;
    fireEvent.change(videoInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText('Save'));

    expect(createMut).toHaveBeenCalledWith(
      { name: 'Video banner', body: 'Watch now', expirationAction: 'disable' },
      expect.anything(),
    );
    expect(uploadVideoMut).toHaveBeenCalledWith(
      { adId: 'new-ad', file },
      expect.anything(),
    );
    expect(updateAdMock).toHaveBeenCalledWith(
      { id: 'new-ad', patch: { format: 'video' } },
      expect.anything(),
    );
    expect(callOrder).toEqual(['create', 'uploadVideo', 'patchFormat']);
  });

  it('creates an album ad reusing library images then patches the format in order', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: [makeLib('lib-1', 'a.png'), makeLib('lib-2', 'b.png')],
      isLoading: false,
      error: null,
    } as never);
    const callOrder: string[] = [];
    const createMut = vi.fn(
      (_body: unknown, opts?: { onSuccess?: (created: AdView) => void }) => {
        callOrder.push('create');
        opts?.onSuccess?.(makeAd({ id: 'new-ad' }));
      },
    );
    mockedUseCreateAd.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: createMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    const reuseImagesMut = vi.fn(
      (_args: unknown, opts?: { onSuccess?: (updated: AdView) => void }) => {
        callOrder.push('reuseImages');
        opts?.onSuccess?.(makeAd({ id: 'new-ad', albumMediaIds: ['lib-1'] }));
      },
    );
    mockedUseReuseLibraryImages.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      mutate: reuseImagesMut,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
    } as never);
    updateAdMock.mockImplementation(
      (_args: unknown, opts?: { onSuccess?: (updated: AdView) => void }) => {
        callOrder.push('patchFormat');
        opts?.onSuccess?.(makeAd({ id: 'new-ad', format: 'album' }));
      },
    );

    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'Album banner' },
    });
    fireEvent.change(screen.getByLabelText(/Body/), {
      target: { value: 'Look at this' },
    });

    fireEvent.click(
      within(modalCard).getByRole('button', { name: /🗂 Álbum/ }),
    );
    fireEvent.click(within(modalCard).getByLabelText('Select a.png for album'));

    fireEvent.click(screen.getByText('Save'));

    expect(createMut).toHaveBeenCalledWith(
      {
        name: 'Album banner',
        body: 'Look at this',
        expirationAction: 'disable',
      },
      expect.anything(),
    );
    expect(reuseImagesMut).toHaveBeenCalledWith(
      { adId: 'new-ad', libraryMediaIds: ['lib-1'] },
      expect.anything(),
    );
    expect(updateAdMock).toHaveBeenCalledWith(
      { id: 'new-ad', patch: { format: 'album' } },
      expect.anything(),
    );
    expect(callOrder).toEqual(['create', 'reuseImages', 'patchFormat']);
  });

  it('disables Save for video format without a staged file', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'Video banner' },
    });
    fireEvent.change(screen.getByLabelText(/Body/), {
      target: { value: 'Watch now' },
    });
    fireEvent.click(
      within(modalCard).getByRole('button', { name: /🎬 Video/ }),
    );

    expect(screen.getByText('Save')).toBeDisabled();
  });

  it('disables Save for album format without a selection', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);
    mockedUseMediaLibrary.mockReturnValue({
      data: [makeLib('lib-1', 'a.png')],
      isLoading: false,
      error: null,
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));

    const modalCard = screen
      .getByText('Add Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'Album banner' },
    });
    fireEvent.change(screen.getByLabelText(/Body/), {
      target: { value: 'Look at this' },
    });
    fireEvent.click(
      within(modalCard).getByRole('button', { name: /🗂 Álbum/ }),
    );

    expect(screen.getByText('Save')).toBeDisabled();
  });

  it('renders the body preview with bold formatting', () => {
    mockedUseAds.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('+ Add Ad'));
    fireEvent.change(screen.getByLabelText(/Body/), {
      target: { value: '<b>hola</b>' },
    });

    const preview = screen.getByLabelText('Ad preview');
    const bold = within(preview).getByText('hola');
    expect(bold.tagName).toBe('B');
    expect(bold).toHaveClass('font-semibold');
  });

  it('locks the format selector when editing an ad with a video', () => {
    mockedUseAds.mockReturnValue({
      data: [makeAd({ format: 'video', videoMediaId: 'media-v' })],
      isLoading: false,
      error: null,
    } as never);

    render(<AdsManager />);
    fireEvent.click(screen.getByText('Edit'));

    const modalCard = screen
      .getByText('Edit Ad')
      .closest('div.bg-slate-900') as HTMLElement;
    expect(modalCard).not.toBeNull();
    expect(
      within(modalCard).getByRole('button', { name: /🎬 Video/ }),
    ).toBeDisabled();
    expect(
      within(modalCard).getByText('Formato bloqueado: el ad ya tiene media.'),
    ).toBeInTheDocument();
    expect(
      within(modalCard).getByLabelText('Current ad video'),
    ).toHaveAttribute('src', '/crypto-news-ads/media/media-v');
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

describe('iso/utc conversion helpers', () => {
  it('round-trips a UTC input through ISO', () => {
    expect(utcInputToIso('2026-08-10T12:00')).toBe('2026-08-10T12:00:00Z');
    expect(isoToUtcInput('2026-08-10T12:00:00.000Z')).toBe('2026-08-10T12:00');
  });

  it('interprets the input as UTC regardless of the machine timezone', () => {
    expect(utcInputToIso('2026-08-10T12:00')).toBe('2026-08-10T12:00:00Z');
  });

  it('returns null for an empty or invalid UTC input', () => {
    expect(utcInputToIso('')).toBeNull();
    expect(utcInputToIso('not-a-date')).toBeNull();
  });

  it('returns an empty string for an invalid ISO', () => {
    expect(isoToUtcInput('not-a-date')).toBe('');
  });
});
