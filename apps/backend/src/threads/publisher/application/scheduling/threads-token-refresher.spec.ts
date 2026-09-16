import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThreadsOAuthTokenStorePort } from 'threads/publisher/application/ports/threads-oauth-token-store.port';
import { ThreadsTokenRefresher } from './threads-token-refresher';

function makeRefresher(
  accessToken: string,
  store?: ThreadsOAuthTokenStorePort,
): ThreadsTokenRefresher {
  const config = {
    get: (_key: string): unknown => ({
      threads: { accessToken, userId: 'me' },
    }),
  } as unknown as ConfigService;
  // Construct directly (Optional store passed explicitly, no Nest DI).
  return new ThreadsTokenRefresher(config, store);
}

describe('ThreadsTokenRefresher', () => {
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

  it("warns 'THREADS skipped: no token' and makes NO network call when token is absent", async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const refresher = makeRefresher('');

    const result = await refresher.refreshOnce();

    expect(result).toEqual({ refreshed: false, reason: 'skipped: no token' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some((args) =>
        String(args[0] ?? '').includes('THREADS skipped: no token'),
      ),
    ).toBe(true);
  });

  it('makes NO network call when token is FAKE', async () => {
    const refresher = makeRefresher('FAKE');

    const result = await refresher.refreshOnce();

    expect(result.refreshed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips refresh (one debug_token call only) when expiry is far away', async () => {
    const farFutureS = Math.floor(Date.now() / 1000) + 30 * 86400;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { expires_at: farFutureS } }),
    } as unknown as Response);
    const store: ThreadsOAuthTokenStorePort = { upsert: jest.fn() };
    const refresher = makeRefresher('REAL_TOKEN', store);

    const result = await refresher.refreshOnce();

    expect(result).toEqual({ refreshed: false, reason: 'refresh not due' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? '')).toContain('debug_token');
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it('refreshes and upserts threads_oauth_tokens id=1 when expiry is < 7d', async () => {
    const soonS = Math.floor(Date.now() / 1000) + 2 * 86400;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: { expires_at: soonS } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ access_token: 'NEW_TOKEN', expires_in: 5184000 }),
      } as unknown as Response);
    const store: ThreadsOAuthTokenStorePort = { upsert: jest.fn() };
    const refresher = makeRefresher('REAL_TOKEN', store);

    const result = await refresher.refreshOnce();

    expect(result).toEqual({ refreshed: true, reason: 'refreshed' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0] ?? '')).toContain(
      'refresh_access_token',
    );
    expect(store.upsert).toHaveBeenCalledWith({
      id: 1,
      accessToken: 'NEW_TOKEN',
      threadsUserId: 'me',
      obtainedAt: expect.any(Date),
      expiresInS: 5184000,
    });
  });

  it('never logs the raw token', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'bad' }),
    } as unknown as Response);
    const refresher = makeRefresher('SECRET_TOKEN_XYZ');

    await refresher.refreshOnce();

    const allLogs = [
      ...warnSpy.mock.calls.flat(),
      ...logSpy.mock.calls.flat(),
    ].map(String);
    expect(allLogs.some((line) => line.includes('SECRET_TOKEN_XYZ'))).toBe(
      false,
    );
  });
});
