import type { ConfigService } from '@nestjs/config';
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
      messageId: 11,
      error: null,
    }),
    postMultipart: jest.fn().mockResolvedValue({
      ok: true,
      messageId: 12,
      error: null,
    }),
    ...overrides,
  } as unknown as jest.Mocked<BotApiHttpClient>;
}

function makeAdapter(
  env: Record<string, string> = {
    CRYPTO_NEWS_BOT_TOKEN: 'crypto-token',
    CRYPTO_NEWS_OUTPUT_CHANNEL: '@crypto-news',
  },
  http?: jest.Mocked<BotApiHttpClient>,
): { adapter: CryptoNewsBotApiAdapter; http: jest.Mocked<BotApiHttpClient> } {
  const client = http ?? makeHttp();
  const adapter = new CryptoNewsBotApiAdapter(
    makeConfig(env),
    client,
    new TelegramRateLimiter(20),
  );
  return { adapter, http: client };
}

describe('CryptoNewsBotApiAdapter', () => {
  it('posts sendMessage to the Bot API and returns the message id', async () => {
    const { adapter, http } = makeAdapter();
    const result = await adapter.sendMessage('@crypto-news', 'hello');
    expect(result).toEqual({ ok: true, messageId: 11, error: null });
    expect(http.postJson).toHaveBeenCalledTimes(1);
    const [url, payload] = http.postJson.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(url).toContain('crypto-token');
    expect(url).toContain('sendMessage');
    expect(payload).toMatchObject({
      chat_id: '@crypto-news',
      text: expect.stringContaining('hello') as unknown,
    });
  });

  it('falls back to CRYPTO_NEWS_OUTPUT_CHANNEL when chatId is empty', async () => {
    const { adapter, http } = makeAdapter();
    await adapter.sendMessage('', 'hello');
    const [, payload] = http.postJson.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload['chat_id']).toBe('@crypto-news');
  });

  it('fails CLOSED with a clear error when the token is missing (no post)', async () => {
    const { adapter, http } = makeAdapter({});
    const result = await adapter.sendMessage('@crypto-news', 'hello');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('CRYPTO_NEWS_BOT_TOKEN');
    expect(result.error).toContain('not configured');
    expect(http.postJson).not.toHaveBeenCalled();
    expect(http.postMultipart).not.toHaveBeenCalled();
  });

  it('fails CLOSED with a clear error when no chat resolves (no post)', async () => {
    const { adapter, http } = makeAdapter({ CRYPTO_NEWS_BOT_TOKEN: 't' });
    const result = await adapter.sendMessage('', 'hello');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('CRYPTO_NEWS_OUTPUT_CHANNEL');
    expect(http.postJson).not.toHaveBeenCalled();
  });

  it('rejects empty text without posting', async () => {
    const { adapter, http } = makeAdapter();
    const result = await adapter.sendMessage('@crypto-news', '');
    expect(result.ok).toBe(false);
    expect(http.postJson).not.toHaveBeenCalled();
  });

  it('blocks sends past the per-minute budget without touching the network', async () => {
    const http = makeHttp();
    const adapter = new CryptoNewsBotApiAdapter(
      makeConfig({
        CRYPTO_NEWS_BOT_TOKEN: 'crypto-token',
        CRYPTO_NEWS_OUTPUT_CHANNEL: '@crypto-news',
      }),
      http,
      new TelegramRateLimiter(1),
    );
    const first = await adapter.sendMessage('@crypto-news', 'one');
    expect(first.ok).toBe(true);
    const second = await adapter.sendMessage('@crypto-news', 'two');
    expect(second.ok).toBe(false);
    expect(second.error).toContain('Rate limit exceeded');
    expect(http.postJson).toHaveBeenCalledTimes(1);
  });

  it('uploads a local photo via multipart sendPhoto', async () => {
    const { adapter, http } = makeAdapter();
    const result = await adapter.sendPhoto(
      '@crypto-news',
      'caption',
      `${__dirname}/__fixtures__/photo.jpg`,
    );
    expect(result).toEqual({ ok: true, messageId: 12, error: null });
    expect(http.postMultipart).toHaveBeenCalledTimes(1);
    const [url, boundary, body] = http.postMultipart.mock.calls[0] as [
      string,
      string,
      Buffer,
    ];
    expect(url).toContain('sendPhoto');
    expect(typeof boundary).toBe('string');
    expect(Buffer.isBuffer(body)).toBe(true);
  });

  it('returns the missing-file error from sendPhoto without posting', async () => {
    const { adapter, http } = makeAdapter();
    const result = await adapter.sendPhoto(
      '@crypto-news',
      'caption',
      '/definitely/not/here.jpg',
    );
    expect(result.ok).toBe(false);
    expect(http.postMultipart).not.toHaveBeenCalled();
  });
});
