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
});
