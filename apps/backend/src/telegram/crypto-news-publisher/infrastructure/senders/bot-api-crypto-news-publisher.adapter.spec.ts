import { ConfigService } from '@nestjs/config';
import { BotApiCryptoNewsPublisherAdapter } from './bot-api-crypto-news-publisher.adapter';

function makeConfigWith(
  botToken: string,
  outputChannel: string,
): ConfigService {
  return {
    get: () => ({
      publishing: { cryptoNews: { botToken, outputChannel } },
    }),
  } as unknown as ConfigService;
}

describe('BotApiCryptoNewsPublisherAdapter — graceful not-configured path', () => {
  it('does NOT throw at construction when both env vars are missing', () => {
    expect(
      () => new BotApiCryptoNewsPublisherAdapter(makeConfigWith('', '')),
    ).not.toThrow();
  });

  it('returns ok=false with not-configured error from sendMessage', async () => {
    const adapter = new BotApiCryptoNewsPublisherAdapter(
      makeConfigWith('', ''),
    );
    const result = await adapter.sendMessage('anyChat', 'hello');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('CRYPTO_NEWS_BOT_TOKEN');
  });

  it('returns ok=false with not-configured error from sendPhoto', async () => {
    const adapter = new BotApiCryptoNewsPublisherAdapter(
      makeConfigWith('', ''),
    );
    const result = await adapter.sendPhoto(
      'anyChat',
      'caption',
      '/tmp/some.jpg',
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('CRYPTO_NEWS_BOT_TOKEN');
  });

  it('reports only the missing channel in the error when token is set', async () => {
    const adapter = new BotApiCryptoNewsPublisherAdapter(
      makeConfigWith('TEST_TOKEN', ''),
    );
    const result = await adapter.sendMessage('anyChat', 'hello');
    expect(result.error).toContain('CRYPTO_NEWS_OUTPUT_CHANNEL');
    expect(result.error).not.toContain('CRYPTO_NEWS_BOT_TOKEN');
  });

  it('reports only the missing token in the error when channel is set', async () => {
    const adapter = new BotApiCryptoNewsPublisherAdapter(
      makeConfigWith('', '@test'),
    );
    const result = await adapter.sendMessage('anyChat', 'hello');
    expect(result.error).toContain('CRYPTO_NEWS_BOT_TOKEN');
    expect(result.error).not.toContain('CRYPTO_NEWS_OUTPUT_CHANNEL');
  });
});
