import { buildTelegramConfig } from './telegram.config';

describe('telegram config', () => {
  it('defaults to the dev ingestion + empty tokens', () => {
    const config = buildTelegramConfig({} as NodeJS.ProcessEnv);
    expect(config.ingestionUrl).toBe('http://localhost:3031');
    expect(config.feedBotToken).toBe('');
    expect(config.threadsBotToken).toBe('');
  });

  it('reads the upstream key (P30: x-api-key from day one)', () => {
    const config = buildTelegramConfig({
      INGESTION_TELEGRAM_API_KEY: 'k',
    } as NodeJS.ProcessEnv);
    expect(config.ingestionApiKey).toBe('k');
  });

  it('defaults output channels to empty + shared 20/min rate limit', () => {
    const config = buildTelegramConfig({} as NodeJS.ProcessEnv);
    expect(config.cryptoNewsOutputChannel).toBe('');
    expect(config.threadsOutputChannel).toBe('');
    expect(config.rateLimitPerMinute).toBe(20);
    expect(config.cryptoNewsRateLimitPerMinute).toBe(20);
    expect(config.threadsRateLimitPerMinute).toBe(20);
  });

  it('lets per-bot rate overrides win over the shared value', () => {
    const config = buildTelegramConfig({
      TELEGRAM_RATE_LIMIT_PER_MINUTE: '30',
      CRYPTO_NEWS_RATE_LIMIT_PER_MINUTE: '10',
    } as NodeJS.ProcessEnv);
    expect(config.rateLimitPerMinute).toBe(30);
    expect(config.cryptoNewsRateLimitPerMinute).toBe(10);
    expect(config.threadsRateLimitPerMinute).toBe(30);
  });
});
