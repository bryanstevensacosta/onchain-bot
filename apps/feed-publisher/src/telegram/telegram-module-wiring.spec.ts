import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './telegram.module';
import { CryptoNewsBotApiAdapter } from './infrastructure/bot-api/crypto-news-bot-api.adapter';
import { ThreadsBotApiAdapter } from './infrastructure/bot-api/threads-bot-api.adapter';
import { TelegramPublisherRouter } from './application/services/telegram-publisher-router.service';
import { TelegramQueuedArticleDispatcher } from './application/dispatch/telegram-queued-article.dispatcher';
import { TelegramScheduledAdDispatcher } from './application/dispatch/telegram-scheduled-ad.dispatcher';
import { TelegramHealthIndicator } from './health/telegram-health.indicator';

describe('TelegramModule', () => {
  it('wires the crypto+threads publisher graph (todo 7)', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TelegramModule,
      ],
    }).compile();
    expect(module.get(TelegramModule)).toBeDefined();
    expect(module.get(CryptoNewsBotApiAdapter)).toBeDefined();
    expect(module.get(ThreadsBotApiAdapter)).toBeDefined();
    expect(module.get(TelegramPublisherRouter)).toBeDefined();
    expect(module.get(TelegramQueuedArticleDispatcher)).toBeDefined();
    expect(module.get(TelegramScheduledAdDispatcher)).toBeDefined();
    expect(module.get(TelegramHealthIndicator)).toBeDefined();
    await module.close();
  });
});
