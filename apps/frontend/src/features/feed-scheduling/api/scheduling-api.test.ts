// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  schedulingImageUrl,
  schedulingVideoUrl,
  clearSchedulingImage,
  clearSchedulingVideo,
  fetchMediaLibrary,
  libraryImageUrl,
  publishSchedulingNow,
  reuseLibraryImage,
  reuseLibraryImages,
  uploadSchedulingImage,
  uploadSchedulingVideo,
  type SchedulingView,
  type CreateSchedulingBody,
  type MediaLibraryView,
  type PublishAdNowResult,
  type UpdateSchedulingBody,
} from './scheduling-api';

import { HttpError } from '@/shared/api/http-client';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeSchedulingView(
  overrides: Partial<SchedulingView> = {},
): SchedulingView {
  return {
    id: 'scheduling-1',
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

describe('schedulingImageUrl', () => {
  it('builds the media URL from an imageMediaId', () => {
    expect(schedulingImageUrl('abc-123')).toBe(
      '/crypto-news-scheduling/media/abc-123',
    );
  });

  it('encodes special characters in the media id', () => {
    expect(schedulingImageUrl('a b/c')).toBe(
      '/crypto-news-scheduling/media/a%20b%2Fc',
    );
  });
});

describe('uploadSchedulingImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs a multipart form to the scheduling image endpoint and resolves with the view', async () => {
    const view = makeSchedulingView({ imageMediaId: 'media-1' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(view));

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const result = await uploadSchedulingImage('scheduling-1', file);

    expect(result).toEqual(view);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain(
      '/crypto-news-scheduling/scheduling/scheduling-1/image',
    );
    expect(init?.method).toBe('POST');
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('file')).toBe(file);
  });

  it('URL-encodes the scheduling id in the path', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeSchedulingView()));

    await uploadSchedulingImage('scheduling/1', new File(['x'], 'a.png'));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/scheduling/scheduling%2F1/image',
    );
  });
});

describe('clearSchedulingImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DELETEs the scheduling image and resolves with the view', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeSchedulingView()));

    const result = await clearSchedulingImage('scheduling-1');

    expect(result.imageMediaId).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain(
      '/crypto-news-scheduling/scheduling/scheduling-1/image',
    );
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
        url: '/crypto-news-scheduling/media/lib-1',
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
    expect(url).toContain('/crypto-news-scheduling/media-library');
    expect(init?.method).toBeUndefined();
  });
});

describe('reuseLibraryImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs the library media id to the reuse endpoint and resolves with the view', async () => {
    const view = makeSchedulingView({ imageMediaId: 'lib-1' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(view));

    const result = await reuseLibraryImage('scheduling-1', 'lib-1');

    expect(result).toEqual(view);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain(
      '/crypto-news-scheduling/scheduling/scheduling-1/reuse-image',
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(JSON.stringify({ libraryMediaId: 'lib-1' }));
  });

  it('URL-encodes the scheduling id in the path', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeSchedulingView()));

    await reuseLibraryImage('scheduling/1', 'lib-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/scheduling/scheduling%2F1/reuse-image',
    );
  });

  it('rejects with an HttpError when the server returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'nope' }, { status: 404 }),
    );

    await expect(reuseLibraryImage('scheduling-1', 'lib-1')).rejects.toThrow(
      HttpError,
    );
    await expect(reuseLibraryImage('scheduling-1', 'lib-1')).rejects.toThrow(
      'POST /crypto-news-scheduling/scheduling/scheduling-1/reuse-image → 404',
    );
  });
});

describe('libraryImageUrl', () => {
  it('builds the library url from a libraryMediaId', () => {
    expect(libraryImageUrl('lib-1')).toBe(
      '/crypto-news-scheduling/media-library/lib-1',
    );
  });

  it('encodes special characters in the library media id', () => {
    expect(libraryImageUrl('a b/c')).toBe(
      '/crypto-news-scheduling/media-library/a%20b%2Fc',
    );
  });
});

describe('schedulingVideoUrl', () => {
  it('builds the media URL from a videoMediaId', () => {
    expect(schedulingVideoUrl('abc-123')).toBe(
      '/crypto-news-scheduling/media/abc-123',
    );
  });

  it('encodes special characters in the media id', () => {
    expect(schedulingVideoUrl('a b/c')).toBe(
      '/crypto-news-scheduling/media/a%20b%2Fc',
    );
  });
});

describe('uploadSchedulingVideo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs a multipart form to the scheduling video endpoint and resolves with the view', async () => {
    const view = makeSchedulingView({ videoMediaId: 'media-1' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(view));

    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    const result = await uploadSchedulingVideo('scheduling-1', file);

    expect(result).toEqual(view);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain(
      '/crypto-news-scheduling/scheduling/scheduling-1/video',
    );
    expect(init?.method).toBe('POST');
    const form = init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('file')).toBe(file);
  });

  it('URL-encodes the scheduling id in the path', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeSchedulingView()));

    await uploadSchedulingVideo('scheduling/1', new File(['x'], 'clip.mp4'));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/scheduling/scheduling%2F1/video',
    );
  });
});

describe('clearSchedulingVideo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DELETEs the scheduling video and resolves with the view', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeSchedulingView()));

    const result = await clearSchedulingVideo('scheduling-1');

    expect(result.videoMediaId).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain(
      '/crypto-news-scheduling/scheduling/scheduling-1/video',
    );
    expect(init?.method).toBe('DELETE');
  });
});

describe('reuseLibraryImages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs the library media ids to the reuse-library-images endpoint and resolves with the view', async () => {
    const view = makeSchedulingView({ albumMediaIds: ['lib-1', 'lib-2'] });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(view));

    const result = await reuseLibraryImages('scheduling-1', ['lib-1', 'lib-2']);

    expect(result).toEqual(view);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain(
      '/crypto-news-scheduling/scheduling/scheduling-1/reuse-library-images',
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(
      JSON.stringify({ libraryMediaIds: ['lib-1', 'lib-2'] }),
    );
  });

  it('URL-encodes the scheduling id in the path', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(makeSchedulingView()));

    await reuseLibraryImages('scheduling/1', ['lib-1']);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/scheduling/scheduling%2F1/reuse-library-images',
    );
  });

  it('rejects with an HttpError when the server returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'nope' }, { status: 404 }),
    );

    await expect(reuseLibraryImages('scheduling-1', ['lib-1'])).rejects.toThrow(
      HttpError,
    );
    await expect(reuseLibraryImages('scheduling-1', ['lib-1'])).rejects.toThrow(
      'POST /crypto-news-scheduling/scheduling/scheduling-1/reuse-library-images → 404',
    );
  });
});

describe('publishSchedulingNow', () => {
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

    const result = await publishSchedulingNow('scheduling-1');

    expect(result).toEqual(resultBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain(
      '/crypto-news-scheduling/scheduling/scheduling-1/publish-now',
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(JSON.stringify({}));
  });

  it('URL-encodes the scheduling id in the path', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ ok: true, messageId: 42, error: null }),
      );

    await publishSchedulingNow('scheduling/1');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/scheduling/scheduling%2F1/publish-now',
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

    const result = await publishSchedulingNow('scheduling-1');

    expect(result).toEqual(failureBody);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('telegram down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects with an HttpError when the server returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'nope' }, { status: 404 }),
    );

    await expect(publishSchedulingNow('scheduling-1')).rejects.toThrow(
      HttpError,
    );
    await expect(publishSchedulingNow('scheduling-1')).rejects.toThrow(
      'POST /crypto-news-scheduling/scheduling/scheduling-1/publish-now → 404',
    );
  });
});

describe('scheduling format types', () => {
  it('SchedulingView carries format/videoMediaId/albumMediaIds', () => {
    const scheduling: SchedulingView = makeSchedulingView({
      format: 'album',
      videoMediaId: null,
      albumMediaIds: ['m-1', 'm-2'],
    });
    expect(scheduling.format).toBe('album');
    expect(scheduling.videoMediaId).toBeNull();
    expect(scheduling.albumMediaIds).toEqual(['m-1', 'm-2']);
  });

  it('CreateSchedulingBody/UpdateSchedulingBody accept format/videoMediaId/albumMediaIds', () => {
    const createBody: CreateSchedulingBody = {
      name: 'x',
      body: 'y',
      format: 'video',
      videoMediaId: 'm-1',
      albumMediaIds: ['m-1', 'm-2'],
    };
    expect(createBody.format).toBe('video');
    expect(createBody.videoMediaId).toBe('m-1');
    expect(createBody.albumMediaIds).toEqual(['m-1', 'm-2']);

    const updateBody: UpdateSchedulingBody = {
      format: 'album',
      videoMediaId: null,
      albumMediaIds: ['m-1'],
    };
    expect(updateBody.format).toBe('album');
    expect(updateBody.videoMediaId).toBeNull();
    expect(updateBody.albumMediaIds).toEqual(['m-1']);
  });
});
