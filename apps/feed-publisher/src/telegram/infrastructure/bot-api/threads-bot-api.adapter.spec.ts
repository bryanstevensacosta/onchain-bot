import type { ConfigService } from '@nestjs/config';
import { ThreadsBotApiAdapter } from './threads-bot-api.adapter';
import { CryptoNewsBotApiAdapter } from './crypto-news-bot-api.adapter';
import type { BotApiHttpClient } from './bot-api-http-client';
import { TelegramRateLimiter } from '../../application/services/telegram-rate-limiter.service';

function makeConfig(env: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, fallback = ''): string =>
      env[key] ?? (fallback as string),
  } as unknown as ConfigService;
}

function makeHttp(
  overrides: Partial<BotApiHttpClient> = {},
): jest.Mocked<BotApiHttpClient> {
  return {
    postJson: jest.fn().mockResolvedValue({
      ok: true,
      messageId: 21,
      error: null,
    }),
    postMultipart: jest.fn().mockResolvedValue({
      ok: true,
      messageId: 22,
      error: null,
    }),
    ...overrides,
  } as unknown as jest.Mocked<BotApiHttpClient>;
}

describe('ThreadsBotApiAdapter', () => {
  it('posts sendMessage with the threads token and returns the message id', async () => {
    const http = makeHttp();
    const adapter = new ThreadsBotApiAdapter(
      makeConfig({
        THREADS_BOT_TOKEN: 'threads-token',
        THREADS_OUTPUT_CHANNEL: '@threads',
      }),
      http,
      new TelegramRateLimiter(20),
    );
    const result = await adapter.sendMessage('@threads', 'hello threads');
    expect(result).toEqual({ ok: true, messageId: 21, error: null });
    const [url] = http.postJson.mock.calls[0] as [string];
    expect(url).toContain('threads-token');
    expect(url).toContain('sendMessage');
  });

  it('fails CLOSED naming THREADS_BOT_TOKEN when the token is missing (no post)', async () => {
    const http = makeHttp();
    const adapter = new ThreadsBotApiAdapter(
      makeConfig({}),
      http,
      new TelegramRateLimiter(20),
    );
    const result = await adapter.sendMessage('@threads', 'hello');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('THREADS_BOT_TOKEN');
    expect(result.error).toContain('not configured');
    expect(http.postJson).not.toHaveBeenCalled();
    expect(http.postMultipart).not.toHaveBeenCalled();
  });

  it('enforces its OWN rate budget independently of the crypto adapter', async () => {
    const cryptoHttp = makeHttp();
    const threadsHttp = makeHttp();
    const crypto = new CryptoNewsBotApiAdapter(
      makeConfig({
        CRYPTO_NEWS_BOT_TOKEN: 'crypto-token',
        CRYPTO_NEWS_OUTPUT_CHANNEL: '@crypto-news',
      }),
      cryptoHttp,
      new TelegramRateLimiter(1),
    );
    const threads = new ThreadsBotApiAdapter(
      makeConfig({
        THREADS_BOT_TOKEN: 'threads-token',
        THREADS_OUTPUT_CHANNEL: '@threads',
      }),
      threadsHttp,
      new TelegramRateLimiter(5),
    );
    expect((await crypto.sendMessage('@c', 'one')).ok).toBe(true);
    expect((await crypto.sendMessage('@c', 'two')).ok).toBe(false);
    expect((await threads.sendMessage('@t', 'two')).ok).toBe(true);
    expect(cryptoHttp.postJson).toHaveBeenCalledTimes(1);
    expect(threadsHttp.postJson).toHaveBeenCalledTimes(1);
  });
});
