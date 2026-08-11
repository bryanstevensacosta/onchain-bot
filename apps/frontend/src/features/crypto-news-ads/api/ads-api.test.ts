// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adImageUrl,
  clearAdImage,
  uploadAdImage,
  type AdView,
} from './ads-api';

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
    imageMediaId: null,
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
