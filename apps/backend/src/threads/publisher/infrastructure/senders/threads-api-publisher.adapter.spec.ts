import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThreadsApiPublisherAdapter } from './threads-api-publisher.adapter';

function makeAdapter(accessToken: string): ThreadsApiPublisherAdapter {
  const config = {
    get: (_key: string): unknown => ({
      threads: { accessToken, userId: 'me' },
    }),
  } as unknown as ConfigService;
  const adapter = new ThreadsApiPublisherAdapter(config);
  adapter.pollIntervalMs = 0;
  return adapter;
}

function jsonResponse(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('ThreadsApiPublisherAdapter', () => {
  const realFetch = globalThis.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('publishes happy path: CREATE -> FINISHED -> published id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, 200, { id: 'container-1' }))
      .mockResolvedValueOnce(jsonResponse(true, 200, { status: 'FINISHED' }))
      .mockResolvedValueOnce(jsonResponse(true, 200, { id: 'media-1' }));
    const adapter = makeAdapter('REAL_TOKEN');

    const result = await adapter.publish({ text: 'hello threads' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      ok: true,
      status: 'published',
      remoteId: 'media-1',
      text: 'hello threads',
      truncated: false,
    });
  });

  it('truncates 600-char input to <=500 chars and still publishes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, 200, { id: 'container-2' }))
      .mockResolvedValueOnce(jsonResponse(true, 200, { status: 'FINISHED' }))
      .mockResolvedValueOnce(jsonResponse(true, 200, { id: 'media-2' }));
    const adapter = makeAdapter('REAL_TOKEN');
    const long = 'x'.repeat(600);

    const result = await adapter.publish({ text: long });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text.length).toBeLessThanOrEqual(500);
      expect(result.truncated).toBe(true);
    }
  });

  it('returns FAILED TIMEOUT (reintentable) when the container never finishes', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, 200, { id: 'container-3' }))
      .mockResolvedValue(jsonResponse(true, 200, { status: 'IN_PROGRESS' }));
    const adapter = makeAdapter('REAL_TOKEN');

    const result = await adapter.publish({ text: 'never finishes' });

    expect(result).toEqual({
      ok: false,
      status: 'FAILED',
      reason: expect.stringContaining('TIMEOUT'),
      reintentable: true,
    });
    // 1 CREATE + 10 polls, no threads_publish call.
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  it('refuses with missing token WITHOUT any network call', async () => {
    const adapter = makeAdapter('');

    const result = await adapter.publish({ text: 'no token' });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses with FAKE token WITHOUT any network call', async () => {
    const adapter = makeAdapter('FAKE');

    const result = await adapter.publish({ text: 'fake token' });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies auth failures as FAILED non-reintentable', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(false, 401, { error: { message: 'invalid token' } }),
    );
    const adapter = makeAdapter('REAL_TOKEN');

    const result = await adapter.publish({ text: 'bad auth' });

    expect(result).toEqual({
      ok: false,
      status: 'FAILED',
      reason: expect.stringContaining('auth failed'),
      reintentable: false,
    });
  });

  it('logs media_skipped and publishes text-only when imagePaths are present', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, 200, { id: 'container-4' }))
      .mockResolvedValueOnce(jsonResponse(true, 200, { status: 'FINISHED' }))
      .mockResolvedValueOnce(jsonResponse(true, 200, { id: 'media-4' }));
    const adapter = makeAdapter('REAL_TOKEN');

    const result = await adapter.publish({
      text: 'with media',
      imagePaths: ['/tmp/pic.jpg'],
    });

    expect(result.ok).toBe(true);
    expect(
      logSpy.mock.calls.some((args) =>
        String(args[0] ?? '').includes('media_skipped'),
      ),
    ).toBe(true);
  });

  it('classifies rate-limit as FAILED reintentable', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(false, 429, { error: { message: 'slow down' } }),
    );
    const adapter = makeAdapter('REAL_TOKEN');

    const result = await adapter.publish({ text: 'rate limited' });

    expect(result).toEqual({
      ok: false,
      status: 'FAILED',
      reason: expect.stringContaining('rate limit'),
      reintentable: true,
    });
  });
});
