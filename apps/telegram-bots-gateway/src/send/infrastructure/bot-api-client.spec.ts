import {
  BotApiClient,
  type BotFetchFn,
} from './bot-api-client';
import { SendAccountingService } from '../application/send-accounting.service';

function okSendMessage(messageId: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: { message_id: messageId } }),
  };
}

function rateLimited(retryAfterSec: number) {
  return {
    ok: false,
    status: 429,
    json: async () => ({
      ok: false,
      error_code: 429,
      description: 'Too Many Requests: retry after 0',
      parameters: { retry_after: retryAfterSec },
    }),
  };
}

describe('BotApiClient 429 backoff (todo 2, red)', () => {
  it('retries once after retry_after and returns the result', async () => {
    let calls = 0;
    const fetchMock = jest.fn(async () => {
      calls += 1;
      return (calls === 1
        ? rateLimited(0)
        : okSendMessage(42)) as unknown as Awaited<ReturnType<BotFetchFn>>;
    });
    const accounting = new SendAccountingService();
    const client = new BotApiClient(
      fetchMock as unknown as BotFetchFn,
      'https://api.telegram.org',
      accounting,
    );
    const res = await client.post('bot1', 'TOKEN', 'sendMessage', {
      chat_id: '1',
      text: 'hi',
    });
    expect(res.result).toMatchObject({ message_id: 42 });
    expect(res.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(accounting.snapshot('bot1').telegram429).toBe(1);
    expect(accounting.snapshot('bot1').retried).toBe(1);
  });

  it('fails closed after persistent 429s (no infinite retry)', async () => {
    const fetchMock = jest.fn(async () => rateLimited(0));
    const accounting = new SendAccountingService();
    const client = new BotApiClient(
      fetchMock as unknown as BotFetchFn,
      'https://api.telegram.org',
      accounting,
      { maxRetries: 2 },
    );
    await expect(
      client.post('bot1', 'TOKEN', 'sendMessage', {
        chat_id: '1',
        text: 'hi',
      }),
    ).rejects.toThrow('persisted');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(accounting.snapshot('bot1').failed).toBe(1);
  });

  it('surfaces non-429 errors without leaking the token', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, description: 'Bad Request: chat not found' }),
    }));
    const accounting = new SendAccountingService();
    const client = new BotApiClient(
      fetchMock as unknown as BotFetchFn,
      'https://api.telegram.org',
      accounting,
    );
    const err = await client
      .post('bot1', 'SUPER-SECRET-TOKEN', 'sendMessage', {
        chat_id: '1',
        text: 'hi',
      })
      .catch((e: Error) => e);
    expect(err.message).toContain('sendMessage failed');
    expect(err.message).not.toContain('SUPER-SECRET-TOKEN');
  });
});
