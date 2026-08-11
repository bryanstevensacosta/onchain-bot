// @vitest-environment jsdom
import '@/test/setup';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpPostForm, HttpError } from './http-client';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('httpPostForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs the FormData and resolves with the parsed JSON body', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ok: true }));

    const formData = new FormData();
    formData.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png');

    const result = await httpPostForm<{ ok: boolean }>(
      '/crypto-news-ads/ads/1/image',
      formData,
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toContain('/crypto-news-ads/ads/1/image');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(formData);
    // Browser sets the multipart boundary — never a manual Content-Type.
    expect(init?.headers).toBeUndefined();
  });

  it('rejects with an HttpError when the server returns 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'boom' }, { status: 500 }),
    );

    const formData = new FormData();
    formData.append('file', new Blob(['x']), 'a.png');

    await expect(
      httpPostForm('/crypto-news-ads/ads/1/image', formData),
    ).rejects.toThrow(HttpError);
    await expect(
      httpPostForm('/crypto-news-ads/ads/1/image', formData),
    ).rejects.toThrow('POST /crypto-news-ads/ads/1/image → 500');
  });
});
