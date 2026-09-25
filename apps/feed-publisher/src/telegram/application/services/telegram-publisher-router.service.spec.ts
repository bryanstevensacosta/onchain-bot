import type { ConfigService } from '@nestjs/config';
import { TelegramPublisherRouter } from './telegram-publisher-router.service';
import { CryptoNewsBotApiAdapter } from '../../infrastructure/bot-api/crypto-news-bot-api.adapter';
import { ThreadsBotApiAdapter } from '../../infrastructure/bot-api/threads-bot-api.adapter';
import type { BotApiHttpClient } from '../../infrastructure/bot-api/bot-api-http-client';
import { TelegramRateLimiter } from './telegram-rate-limiter.service';

function makeConfig(env: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback = ''): string =>
      env[key] ?? (fallback as string),
  } as unknown as ConfigService;
}

function silentHttp(): jest.Mocked<BotApiHttpClient> {
  return {
    postJson: jest
      .fn()
      .mockResolvedValue({ ok: true, messageId: 1, error: null }),
    postMultipart: jest
      .fn()
      .mockResolvedValue({ ok: true, messageId: 2, error: null }),
  } as unknown as jest.Mocked<BotApiHttpClient>;
}

describe('TelegramPublisherRouter', () => {
  it("routes 'crypto-news' to the crypto adapter and 'threads' to threads", () => {
    const crypto = new CryptoNewsBotApiAdapter(
      makeConfig({
        CRYPTO_NEWS_BOT_TOKEN: 'c',
        CRYPTO_NEWS_OUTPUT_CHANNEL: '@c',
      }),
      silentHttp(),
      new TelegramRateLimiter(20),
    );
    const threads = new ThreadsBotApiAdapter(
      makeConfig({ THREADS_BOT_TOKEN: 't', THREADS_OUTPUT_CHANNEL: '@t' }),
      silentHttp(),
      new TelegramRateLimiter(20),
    );
    const router = new TelegramPublisherRouter(crypto, threads);
    expect(router.forContentType('crypto-news')).toBe(crypto);
    expect(router.forContentType('threads')).toBe(threads);
  });

  it("routes scheduling targets ('telegram' -> crypto, 'threads' -> threads)", () => {
    const crypto = new CryptoNewsBotApiAdapter(
      makeConfig({
        CRYPTO_NEWS_BOT_TOKEN: 'c',
        CRYPTO_NEWS_OUTPUT_CHANNEL: '@c',
      }),
      silentHttp(),
      new TelegramRateLimiter(20),
    );
    const threads = new ThreadsBotApiAdapter(
      makeConfig({ THREADS_BOT_TOKEN: 't', THREADS_OUTPUT_CHANNEL: '@t' }),
      silentHttp(),
      new TelegramRateLimiter(20),
    );
    const router = new TelegramPublisherRouter(crypto, threads);
    expect(router.forSchedulingTarget('telegram')).toBe(crypto);
    expect(router.forSchedulingTarget('threads')).toBe(threads);
  });

  it('throws a clear error for unknown content types', () => {
    const crypto = new CryptoNewsBotApiAdapter(
      makeConfig({}),
      silentHttp(),
      new TelegramRateLimiter(20),
    );
    const threads = new ThreadsBotApiAdapter(
      makeConfig({}),
      silentHttp(),
      new TelegramRateLimiter(20),
    );
    const router = new TelegramPublisherRouter(crypto, threads);
    expect(() => router.forContentType('sibling-type')).toThrow(
      'Unsupported content type',
    );
  });
});
