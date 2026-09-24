import { buildTelegramConfig } from './telegram.config';

describe('buildTelegramConfig', () => {
  it('trims the api key and leaves botToken empty (DB catalog owns tokens)', () => {
    const cfg = buildTelegramConfig({
      KOL_SYSTEM_API_KEY: '  secret  ',
    });
    expect(cfg.botToken).toBe('');
    expect(cfg.apiKey).toBe('secret');
  });

  it('defaults to empty strings', () => {
    expect(buildTelegramConfig({})).toEqual({ botToken: '', apiKey: '' });
  });
});
