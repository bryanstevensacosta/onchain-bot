import type { ConfigService } from '@nestjs/config';
import { TelegramScheduledAdDispatcher } from './telegram-scheduled-ad.dispatcher';
import { TelegramPublisherRouter } from '../services/telegram-publisher-router.service';
import type { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import { ScheduledAd } from '../../../scheduling/domain/scheduled-ad.entity';

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
      messageId: 31,
      error: null,
    }),
    sendPhoto: jest.fn(),
    sendMediaGroup: jest.fn(),
    sendVideo: jest.fn(),
    getChat: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  } as unknown as jest.Mocked<TelegramPublisherPort>;
}

function makeAd(body = 'ad body'): ScheduledAd {
  return ScheduledAd.create({
    name: 'ad',
    body,
    format: 'text',
  });
}

describe('TelegramScheduledAdDispatcher', () => {
  it("publishes telegram-target posts via the crypto adapter ('telegram' -> crypto)", async () => {
    const crypto = makeAdapter();
    const threads = makeAdapter();
    const dispatcher = new TelegramScheduledAdDispatcher(
      new TelegramPublisherRouter(crypto, threads),
      makeConfig({ CRYPTO_NEWS_OUTPUT_CHANNEL: '@crypto-news' }),
    );
    const result = await dispatcher.publish(makeAd(), 'telegram');
    expect(result).toEqual({ ok: true, messageId: 31, error: null });
    expect(crypto.sendMessage).toHaveBeenCalledTimes(1);
    expect(threads.sendMessage).not.toHaveBeenCalled();
  });

  it('publishes threads-target posts via the threads adapter', async () => {
    const crypto = makeAdapter();
    const threads = makeAdapter();
    const dispatcher = new TelegramScheduledAdDispatcher(
      new TelegramPublisherRouter(crypto, threads),
      makeConfig({ THREADS_OUTPUT_CHANNEL: '@threads' }),
    );
    const result = await dispatcher.publish(makeAd(), 'threads');
    expect(result.ok).toBe(true);
    expect(threads.sendMessage).toHaveBeenCalledTimes(1);
    expect(crypto.sendMessage).not.toHaveBeenCalled();
  });

  it('returns ok=false (never throws, never burns) when the channel is missing', async () => {
    const crypto = makeAdapter();
    const dispatcher = new TelegramScheduledAdDispatcher(
      new TelegramPublisherRouter(crypto, makeAdapter()),
      makeConfig({}),
    );
    const result = await dispatcher.publish(makeAd(), 'telegram');
    expect(result.ok).toBe(false);
    expect(result.messageId).toBeNull();
    expect(result.error).toContain('not configured');
    expect(crypto.sendMessage).not.toHaveBeenCalled();
  });

  it('propagates adapter failures as ok=false so the use-case books failures', async () => {
    const crypto = makeAdapter({
      sendMessage: jest.fn().mockResolvedValue({
        ok: false,
        messageId: null,
        error: 'chat not found',
      }),
    });
    const dispatcher = new TelegramScheduledAdDispatcher(
      new TelegramPublisherRouter(crypto, makeAdapter()),
      makeConfig({ CRYPTO_NEWS_OUTPUT_CHANNEL: '@c' }),
    );
    const result = await dispatcher.publish(makeAd(), 'telegram');
    expect(result).toEqual({
      ok: false,
      messageId: null,
      error: 'chat not found',
    });
  });
});
