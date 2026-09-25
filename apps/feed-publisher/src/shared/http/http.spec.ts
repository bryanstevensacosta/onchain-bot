import axios from 'axios';
import { SharedHttpClient } from './http-client';
import { delayForAttempt, withRetry } from './retry-policy';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('retry-policy', () => {
  it('backs off exponentially and caps at maxDelayMs', () => {
    expect(delayForAttempt(1)).toBe(1000);
    expect(delayForAttempt(2)).toBe(2000);
    expect(delayForAttempt(3)).toBe(4000);
    expect(delayForAttempt(10)).toBe(30_000);
  });

  it('withRetry returns the first success', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 2) {
          throw new Error('flaky');
        }
        return 'ok';
      },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
      async () => undefined,
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('withRetry rethrows after exhausting attempts', async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error('always down');
        },
        { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
        async () => undefined,
      ),
    ).rejects.toThrow('always down');
  });

  it('SharedHttpClient retries GET then returns data', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce({ data: { ok: true } });
    mockedAxios.create.mockReturnValue({ get, post: jest.fn() } as never);
    const client = new SharedHttpClient(
      { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
      1000,
    );
    await expect(client.get('http://x/feed')).resolves.toEqual({ ok: true });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('SharedHttpClient POSTs with headers', async () => {
    const post = jest.fn().mockResolvedValue({ data: { id: 1 } });
    mockedAxios.create.mockReturnValue({ get: jest.fn(), post } as never);
    const client = new SharedHttpClient(
      { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
      1000,
    );
    await expect(
      client.post('http://x/send', { text: 'hi' }, { 'x-api-key': 'k' }),
    ).resolves.toEqual({ id: 1 });
    expect(post).toHaveBeenCalledWith(
      'http://x/send',
      { text: 'hi' },
      { headers: { 'x-api-key': 'k' } },
    );
  });
});
