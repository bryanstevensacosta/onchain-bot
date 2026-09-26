import type { ConfigService } from '@nestjs/config';
import { TelegramQueuedArticleDispatcher } from '../dispatch/telegram-queued-article.dispatcher';
import { TelegramScheduledAdDispatcher } from '../dispatch/telegram-scheduled-ad.dispatcher';
import { TelegramPublisherRouter } from '../services/telegram-publisher-router.service';
import { DualSendParityService } from '../services/dual-send-parity.service';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';
import type {
  BotsGatewaySenderPort,
  GatewayFeedSendInput,
} from '../../domain/ports/bots-gateway-sender.port';
import type { TelegramPublisherPort } from '../../domain/ports/telegram-publisher.port';
import { PublisherQueueEntry } from '../../../queue/domain/publisher-queue-entry.entity';

function makeConfig(env: Record<string, string> = {}): ConfigService {
  return {
    get: (path: string, fallback = ''): unknown => {
      if (path === 'telegram') {
        return {
          cryptoNewsOutputChannel: env.CRYPTO_NEWS_OUTPUT_CHANNEL ?? '',
          threadsOutputChannel: env.THREADS_OUTPUT_CHANNEL ?? '',
          botsGateway: {
            baseUrl: 'http://localhost:4070',
            clientId: '',
            clientSecret: '',
            publishMode: env.FEED_PUBLISH_MODE ?? 'dual',
          },
        };
      }
      return env[path] ?? fallback;
    },
  } as unknown as ConfigService;
}

function makeAdapter(): jest.Mocked<TelegramPublisherPort> {
  return {
    sendMessage: jest.fn().mockResolvedValue({
      ok: true,
      messageId: 7,
      error: null,
    }),
    sendPhoto: jest.fn(),
    sendMediaGroup: jest.fn(),
    sendVideo: jest.fn(),
    getChat: jest.fn(),
  } as unknown as jest.Mocked<TelegramPublisherPort>;
}

function makeGateway(result: { ok: boolean; messageId: number | null }): {
  sender: BotsGatewaySenderPort;
  calls: GatewayFeedSendInput[];
} {
  const calls: GatewayFeedSendInput[] = [];
  const sender = {
    sendViaGateway: jest.fn().mockImplementation((input: GatewayFeedSendInput) => {
      calls.push(input);
      return Promise.resolve({
        ok: result.ok,
        messageId: result.messageId,
        error: result.ok ? null : 'gateway boom',
      });
    }),
  } as unknown as BotsGatewaySenderPort;
  return { sender, calls };
}

describe('feed-publisher publish-via-gateway (dual parity)', () => {
  it('queue drain dual-send agrees on outcome with 0 divergences', async () => {
    const crypto = makeAdapter();
    const router = new TelegramPublisherRouter(crypto, makeAdapter());
    const { sender, calls } = makeGateway({ ok: true, messageId: 777 });
    const parity = new DualSendParityService();
    const dispatcher = new TelegramQueuedArticleDispatcher(
      router,
      makeConfig({
        CRYPTO_NEWS_OUTPUT_CHANNEL: '@crypto-news',
        FEED_PUBLISH_MODE: 'dual',
      }),
      undefined,
      sender,
      parity,
      new GatewayBotMappingService(),
    );
    const out = await dispatcher.dispatch(
      PublisherQueueEntry.create({
        contentType: 'crypto-news',
        channelId: '-1001',
        messageId: 42,
        rawContent: 'raw',
      }),
      'rendered body',
    );
    expect(out).toEqual({ telegramMessageId: '7' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      botId: 'env:CRYPTO_NEWS_BOT_TOKEN',
      chatId: '@crypto-news',
      kind: 'message',
    });
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 0 });
    expect(() => parity.assertNoDivergence()).not.toThrow();
  });

  it('queue drain records a divergence when the legs disagree', async () => {
    const crypto = makeAdapter();
    const router = new TelegramPublisherRouter(crypto, makeAdapter());
    const { sender } = makeGateway({ ok: false, messageId: null });
    const parity = new DualSendParityService();
    const dispatcher = new TelegramQueuedArticleDispatcher(
      router,
      makeConfig({
        CRYPTO_NEWS_OUTPUT_CHANNEL: '@crypto-news',
        FEED_PUBLISH_MODE: 'dual',
      }),
      undefined,
      sender,
      parity,
      new GatewayBotMappingService(),
    );
    await dispatcher.dispatch(
      PublisherQueueEntry.create({
        contentType: 'crypto-news',
        channelId: '-1001',
        messageId: 42,
        rawContent: 'raw',
      }),
      'rendered body',
    );
    expect(parity.snapshot()).toMatchObject({ total: 1, diverged: 1 });
    expect(() => parity.assertNoDivergence()).toThrow(/cutover blocked/);
  });
});
