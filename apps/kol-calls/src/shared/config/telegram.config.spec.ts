import { buildTelegramConfig } from './telegram.config';

describe('buildTelegramConfig', () => {
  it('trims the api key and leaves botToken empty (DB catalog owns tokens)', () => {
    const cfg = buildTelegramConfig({
      KOL_CALLS_API_KEY: '  secret  ',
    });
    expect(cfg.botToken).toBe('');
    expect(cfg.apiKey).toBe('secret');
  });

  it('defaults to empty strings with a dual gateway mode', () => {
    expect(buildTelegramConfig({})).toEqual({
      botToken: '',
      apiKey: '',
      botsGateway: {
        baseUrl: 'http://localhost:4070',
        clientId: '',
        clientSecret: '',
        publishMode: 'dual',
      },
    });
  });

  it('parses gateway client config and publish mode', () => {
    const cfg = buildTelegramConfig({
      BOTS_GATEWAY_URL: 'http://gateway:4071/',
      BOTS_GATEWAY_CLIENT_ID: 'kol-calls',
      BOTS_GATEWAY_CLIENT_SECRET: 's3cret',
      KOL_PUBLISH_MODE: 'gateway',
    });
    expect(cfg.botsGateway).toEqual({
      baseUrl: 'http://gateway:4071',
      clientId: 'kol-calls',
      clientSecret: 's3cret',
      publishMode: 'gateway',
    });
  });

  it('falls back to dual on unknown publish modes', () => {
    const cfg = buildTelegramConfig({ KOL_PUBLISH_MODE: 'sometimes' });
    expect(cfg.botsGateway.publishMode).toBe('dual');
  });
});
