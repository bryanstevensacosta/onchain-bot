import type { ConfigService } from '@nestjs/config';
import { TelegramQueuedArticleDispatcher } from './telegram-queued-article.dispatcher';
import { TelegramPublisherRouter } from '../services/telegram-publisher-router.service';
import type { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import { PublisherQueueEntry } from '../../../queue/domain/publisher-queue-entry.entity';
import type { LlmConfigRepository } from '../../../llm/domain/ports/llm-config.repository';

function makeConfig(env: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, fallback = ''): string =>
      env[key] ?? (fallback as string),
  } as unknown as ConfigService;
}

function makeAdapter(
  overrides: Partial<TelegramPublisherPort> = {},
): jest.Mocked<TelegramPublisherPort> {
  return {
    sendMessage: jest.fn().mockResolvedValue({
      ok: true,
      messageId: 7,
      error: null,
    }),
    sendPhoto: jest.fn().mockResolvedValue({
      ok: true,
      messageId: 8,
      error: null,
    }),
    sendMediaGroup: jest.fn().mockResolvedValue({
      ok: true,
      messageId: 9,
      error: null,
    }),
    sendVideo: jest.fn().mockResolvedValue({
      ok: true,
      messageId: 10,
      error: null,
    }),
    getChat: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  } as unknown as jest.Mocked<TelegramPublisherPort>;
}

function makeEntry(
  overrides: Partial<Parameters<typeof PublisherQueueEntry.create>[0]> = {},
): PublisherQueueEntry {
  return PublisherQueueEntry.create({
    contentType: 'crypto-news',
    channelId: '-1001',
    messageId: 42,
    rawContent: 'raw',
    ...overrides,
  });
}

describe('TelegramQueuedArticleDispatcher', () => {
  it('dispatches text-only crypto entries via sendMessage on the crypto adapter', async () => {
    const crypto = makeAdapter();
    const threads = makeAdapter();
    const router = new TelegramPublisherRouter(crypto, threads);
    const dispatcher = new TelegramQueuedArticleDispatcher(
      router,
      makeConfig({ CRYPTO_NEWS_OUTPUT_CHANNEL: '@crypto-news' }),
    );
    const out = await dispatcher.dispatch(makeEntry(), 'rendered body');
    expect(out).toEqual({ telegramMessageId: '7' });
    expect(crypto.sendMessage).toHaveBeenCalledWith(
      '@crypto-news',
      'rendered body',
      undefined,
      undefined,
    );
    expect(threads.sendMessage).not.toHaveBeenCalled();
  });

  it("routes 'threads' entries to the threads adapter", async () => {
    const crypto = makeAdapter();
    const threads = makeAdapter();
    const router = new TelegramPublisherRouter(crypto, threads);
    const dispatcher = new TelegramQueuedArticleDispatcher(
      router,
      makeConfig({ THREADS_OUTPUT_CHANNEL: '@threads' }),
    );
    await dispatcher.dispatch(
      makeEntry({ contentType: 'threads' }),
      'thread body',
    );
    expect(threads.sendMessage).toHaveBeenCalledTimes(1);
    expect(crypto.sendMessage).not.toHaveBeenCalled();
  });

  it('prefers the LlmConfig targetChannel over the env output channel', async () => {
    const crypto = makeAdapter();
    const router = new TelegramPublisherRouter(crypto, makeAdapter());
    const llmConfigs = {
      load: jest.fn().mockResolvedValue({ targetChannel: '@from-config' }),
    } as unknown as LlmConfigRepository;
    const dispatcher = new TelegramQueuedArticleDispatcher(
      router,
      makeConfig({ CRYPTO_NEWS_OUTPUT_CHANNEL: '@crypto-news' }),
      llmConfigs,
    );
    await dispatcher.dispatch(makeEntry(), 'body');
    expect(crypto.sendMessage).toHaveBeenCalledWith(
      '@from-config',
      'body',
      undefined,
      undefined,
    );
  });

  it('sends a single local image via sendPhoto', async () => {
    const crypto = makeAdapter();
    const router = new TelegramPublisherRouter(crypto, makeAdapter());
    const dispatcher = new TelegramQueuedArticleDispatcher(
      router,
      makeConfig({ CRYPTO_NEWS_OUTPUT_CHANNEL: '@crypto-news' }),
    );
    await dispatcher.dispatch(
      makeEntry({ imagePaths: ['/tmp/a.jpg'] }),
      'body with photo',
    );
    expect(crypto.sendPhoto).toHaveBeenCalledWith(
      '@crypto-news',
      'body with photo',
      '/tmp/a.jpg',
      undefined,
    );
    expect(crypto.sendMessage).not.toHaveBeenCalled();
  });

  it('sends multiple local images via sendMediaGroup', async () => {
    const crypto = makeAdapter();
    const router = new TelegramPublisherRouter(crypto, makeAdapter());
    const dispatcher = new TelegramQueuedArticleDispatcher(
      router,
      makeConfig({ CRYPTO_NEWS_OUTPUT_CHANNEL: '@crypto-news' }),
    );
    await dispatcher.dispatch(
      makeEntry({ imagePaths: ['/tmp/a.jpg', '/tmp/b.jpg'] }),
      'album body',
    );
    expect(crypto.sendMediaGroup).toHaveBeenCalledWith(
      '@crypto-news',
      'album body',
      ['/tmp/a.jpg', '/tmp/b.jpg'],
    );
  });

  it('throws a not-configured error without burning the queue when nothing resolves', async () => {
    const crypto = makeAdapter({
      sendMessage: jest.fn().mockResolvedValue({
        ok: false,
        messageId: null,
        error:
          'CryptoNewsBotApiAdapter: missing CRYPTO_NEWS_BOT_TOKEN (not configured)',
      }),
    });
    const router = new TelegramPublisherRouter(crypto, makeAdapter());
    const dispatcher = new TelegramQueuedArticleDispatcher(
      router,
      makeConfig({}),
    );
    await expect(dispatcher.dispatch(makeEntry(), 'body')).rejects.toThrow(
      'not configured',
    );
  });

  it('throws the adapter error when the send itself fails', async () => {
    const crypto = makeAdapter({
      sendMessage: jest.fn().mockResolvedValue({
        ok: false,
        messageId: null,
        error: 'chat not found',
      }),
    });
    const router = new TelegramPublisherRouter(crypto, makeAdapter());
    const dispatcher = new TelegramQueuedArticleDispatcher(
      router,
      makeConfig({ CRYPTO_NEWS_OUTPUT_CHANNEL: '@c' }),
    );
    await expect(dispatcher.dispatch(makeEntry(), 'body')).rejects.toThrow(
      'chat not found',
    );
  });
});
