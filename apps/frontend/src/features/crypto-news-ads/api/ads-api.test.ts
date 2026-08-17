// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adImageUrl,
  adVideoUrl,
  clearAdImage,
  clearAdVideo,
  fetchMediaLibrary,
  libraryImageUrl,
  publishAdNow,
  reuseLibraryImage,
  reuseLibraryImages,
  uploadAdImage,
  uploadAdVideo,
  type AdView,
  type CreateAdBody,
  type MediaLibraryView,
  type PublishAdNowResult,
  type UpdateAdBody,
} from './ads-api';

import { HttpError } from '@/shared/api/http-client';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeAdView(overrides: Partial<AdView> = {}): AdView {
  return {
    id: 'ad-1',
    name: 'Pump alpha',
    body: 'Something good',
    buttons: null,
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
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('adImageUrl', () => {
  it('builds the media URL from an imageMediaId', () => {
    expect(adImageUrl('abc-123')).toBe('/crypto-news-ads/media/abc-123');
  });

  it('encodes special characters in the media id', () => {
    expect(adImageUrl('a b/c')).toBe('/crypto-news-ads/media/a%20b%2Fc');
  });
});

describe('uploadAdImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs a multipart form to the ad image endpoint and resolves with the view', async () => {
    const view = makeAdView({ imageMediaId: 'media-1' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(view));

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const result = await uploadAdImage('ad-1', file);

    expect(result).toEqual(view);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain('/crypto-news-ads/ads/ad-1/image');
    expect(init?.method).toBe('POST');
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('file')).toBe(file);
  });

  it('URL-encodes the ad id in the path', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeAdView()));

    await uploadAdImage('ad/1', new File(['x'], 'a.png'));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/ads/ad%2F1/image');
  });
});

describe('clearAdImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DELETEs the ad image and resolves with the view', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeAdView()));

    const result = await clearAdImage('ad-1');

    expect(result.imageMediaId).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain('/crypto-news-ads/ads/ad-1/image');
    expect(init?.method).toBe('DELETE');
  });
});

describe('fetchMediaLibrary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs the media library endpoint and parses the list', async () => {
    const library: MediaLibraryView[] = [
      {
        id: 'lib-1',
        url: '/crypto-news-ads/media/lib-1',
        originalFileName: 'a.png',
        mimeType: 'image/png',
        fileSize: 1024,
        createdAt: '2026-08-03T00:00:00.000Z',
      },
    ];
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(library));

    const result = await fetchMediaLibrary();

    expect(result).toEqual(library);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain('/crypto-news-ads/media-library');
    expect(init?.method).toBeUndefined();
  });
});

describe('reuseLibraryImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs the library media id to the reuse endpoint and resolves with the view', async () => {
    const view = makeAdView({ imageMediaId: 'lib-1' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(view));

    const result = await reuseLibraryImage('ad-1', 'lib-1');

    expect(result).toEqual(view);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain('/crypto-news-ads/ads/ad-1/reuse-image');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(JSON.stringify({ libraryMediaId: 'lib-1' }));
  });

  it('URL-encodes the ad id in the path', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeAdView()));

    await reuseLibraryImage('ad/1', 'lib-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/ads/ad%2F1/reuse-image',
    );
  });

  it('rejects with an HttpError when the server returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'nope' }, { status: 404 }),
    );

    await expect(reuseLibraryImage('ad-1', 'lib-1')).rejects.toThrow(HttpError);
    await expect(reuseLibraryImage('ad-1', 'lib-1')).rejects.toThrow(
      'POST /crypto-news-ads/ads/ad-1/reuse-image → 404',
    );
  });
});

describe('libraryImageUrl', () => {
  it('builds the library url from a libraryMediaId', () => {
    expect(libraryImageUrl('lib-1')).toBe(
      '/crypto-news-ads/media-library/lib-1',
    );
  });

  it('encodes special characters in the library media id', () => {
    expect(libraryImageUrl('a b/c')).toBe(
      '/crypto-news-ads/media-library/a%20b%2Fc',
    );
  });
});

describe('adVideoUrl', () => {
  it('builds the media URL from a videoMediaId', () => {
    expect(adVideoUrl('abc-123')).toBe('/crypto-news-ads/media/abc-123');
  });

  it('encodes special characters in the media id', () => {
    expect(adVideoUrl('a b/c')).toBe('/crypto-news-ads/media/a%20b%2Fc');
  });
});

describe('uploadAdVideo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs a multipart form to the ad video endpoint and resolves with the view', async () => {
    const view = makeAdView({ videoMediaId: 'media-1' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(view));

    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    const result = await uploadAdVideo('ad-1', file);

    expect(result).toEqual(view);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain('/crypto-news-ads/ads/ad-1/video');
    expect(init?.method).toBe('POST');
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('file')).toBe(file);
  });

  it('URL-encodes the ad id in the path', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeAdView()));

    await uploadAdVideo('ad/1', new File(['x'], 'clip.mp4'));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/ads/ad%2F1/video');
  });
});

describe('clearAdVideo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DELETEs the ad video and resolves with the view', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeAdView()));

    const result = await clearAdVideo('ad-1');

    expect(result.videoMediaId).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain('/crypto-news-ads/ads/ad-1/video');
    expect(init?.method).toBe('DELETE');
  });
});

describe('reuseLibraryImages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs the library media ids to the reuse-library-images endpoint and resolves with the view', async () => {
    const view = makeAdView({ albumMediaIds: ['lib-1', 'lib-2'] });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(view));

    const result = await reuseLibraryImages('ad-1', ['lib-1', 'lib-2']);

    expect(result).toEqual(view);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain('/crypto-news-ads/ads/ad-1/reuse-library-images');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(
      JSON.stringify({ libraryMediaIds: ['lib-1', 'lib-2'] }),
    );
  });

  it('URL-encodes the ad id in the path', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeAdView()));

    await reuseLibraryImages('ad/1', ['lib-1']);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/ads/ad%2F1/reuse-library-images',
    );
  });

  it('rejects with an HttpError when the server returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'nope' }, { status: 404 }),
    );

    await expect(reuseLibraryImages('ad-1', ['lib-1'])).rejects.toThrow(
      HttpError,
    );
    await expect(reuseLibraryImages('ad-1', ['lib-1'])).rejects.toThrow(
      'POST /crypto-news-ads/ads/ad-1/reuse-library-images → 404',
    );
  });
});

describe('publishAdNow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs an empty JSON body to the publish-now endpoint and maps the response', async () => {
    const resultBody: PublishAdNowResult = {
      ok: true,
      messageId: 42,
      error: null,
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(resultBody));

    const result = await publishAdNow('ad-1');

    expect(result).toEqual(resultBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain('/crypto-news-ads/ads/ad-1/publish-now');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(JSON.stringify({}));
  });

  it('URL-encodes the ad id in the path', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ ok: true, messageId: 42, error: null }),
      );

    await publishAdNow('ad/1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/ads/ad%2F1/publish-now',
    );
  });

  it('maps a 200 ok:false send failure as data, not a thrown error', async () => {
    const failureBody: PublishAdNowResult = {
      ok: false,
      messageId: null,
      error: 'telegram down',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(failureBody));

    const result = await publishAdNow('ad-1');

    expect(result).toEqual(failureBody);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('telegram down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects with an HttpError when the server returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'nope' }, { status: 404 }),
    );

    await expect(publishAdNow('ad-1')).rejects.toThrow(HttpError);
    await expect(publishAdNow('ad-1')).rejects.toThrow(
      'POST /crypto-news-ads/ads/ad-1/publish-now → 404',
    );
  });
});

describe('ads format types', () => {
  it('AdView carries format/videoMediaId/albumMediaIds', () => {
    const ad: AdView = makeAdView({
      format: 'album',
      videoMediaId: null,
      albumMediaIds: ['m-1', 'm-2'],
    });
    expect(ad.format).toBe('album');
    expect(ad.videoMediaId).toBeNull();
    expect(ad.albumMediaIds).toEqual(['m-1', 'm-2']);
  });

  it('CreateAdBody/UpdateAdBody accept format/videoMediaId/albumMediaIds', () => {
    const createBody: CreateAdBody = {
      name: 'x',
      body: 'y',
      format: 'video',
      videoMediaId: 'm-1',
      albumMediaIds: ['m-1', 'm-2'],
    };
    expect(createBody.format).toBe('video');
    expect(createBody.videoMediaId).toBe('m-1');
    expect(createBody.albumMediaIds).toEqual(['m-1', 'm-2']);

    const updateBody: UpdateAdBody = {
      format: 'album',
      videoMediaId: null,
      albumMediaIds: ['m-1'],
    };
    expect(updateBody.format).toBe('album');
    expect(updateBody.videoMediaId).toBeNull();
    expect(updateBody.albumMediaIds).toEqual(['m-1']);
  });
});
