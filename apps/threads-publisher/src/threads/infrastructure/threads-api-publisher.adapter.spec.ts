import { ThreadsApiPublisherAdapter } from './threads-api-publisher.adapter';

describe('ThreadsApiPublisherAdapter', () => {
  const OLD_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD_ENV };
    jest.restoreAllMocks();
  });

  it('truncates 600 chars to 500 pre-publish', () => {
    const out = ThreadsApiPublisherAdapter.truncateForThreads('x'.repeat(600));
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBe(500);
  });

  it('refuses with FAKE token without network', async () => {
    process.env.THREADS_ACCESS_TOKEN = 'FAKE';
    const spy = jest.spyOn(globalThis, 'fetch');
    const adapter = new ThreadsApiPublisherAdapter({});
    const res = await adapter.publish({ text: 'hello' });
    expect(res.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('REFUSEs empty token without fetch', async () => {
    process.env.THREADS_ACCESS_TOKEN = '';
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('must not be called'));
    const adapter = new ThreadsApiPublisherAdapter({});
    const res = await adapter.publish({ text: 'hello' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch('REFUSE');
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('publishes CREATE->FINISHED with mocked fetch', async () => {
    process.env.THREADS_ACCESS_TOKEN = 'real-token';
    process.env.THREADS_USER_ID = 'me';
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'container-1' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'FINISHED' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'media-1' }),
      } as Response);
    const adapter = new ThreadsApiPublisherAdapter({});
    adapter.pollIntervalMs = 0;
    const res = await adapter.publish({ text: 'hello threads' });
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('TIMEOUTs when the container never finishes', async () => {
    process.env.THREADS_ACCESS_TOKEN = 'real-token';
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'container-2' }),
      } as Response)
      .mockImplementation(
        async () =>
          ({
            ok: true,
            json: async () => ({ status: 'IN_PROGRESS' }),
          }) as Response,
      );
    const adapter = new ThreadsApiPublisherAdapter({});
    adapter.pollIntervalMs = 0;
    adapter.maxPollAttempts = 2;
    const res = await adapter.publish({ text: 'hello' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch('TIMEOUT');
      expect(res.reintentable).toBe(true);
    }
  });
});
