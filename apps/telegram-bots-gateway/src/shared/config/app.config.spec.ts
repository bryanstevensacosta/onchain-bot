import { buildAppConfig } from './app.config';

describe('bots-gateway config (Tier-1)', () => {
  const baseEnv = {
    ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    DATABASE_URL: 'postgres://localhost:5432/onchain_bot_bots',
  };

  it('builds with valid env (default port 4070)', () => {
    const cfg = buildAppConfig(baseEnv);
    expect(cfg.port).toBe(4070);
    expect(cfg.encryptionKey).toBe(baseEnv.ENCRYPTION_KEY);
    expect(cfg.databaseUrl).toContain('onchain_bot_bots');
  });

  it('reads BOTS_GATEWAY_PORT (staging 4071 / prod 4072)', () => {
    expect(buildAppConfig({ ...baseEnv, BOTS_GATEWAY_PORT: '4071' }).port).toBe(
      4071,
    );
  });

  it('throws a clear error without ENCRYPTION_KEY (no boot)', () => {
    expect(() => buildAppConfig({ ...baseEnv, ENCRYPTION_KEY: '' })).toThrow(
      'ENCRYPTION_KEY is required',
    );
    expect(() =>
      buildAppConfig({ ...baseEnv, ENCRYPTION_KEY: undefined }),
    ).toThrow('ENCRYPTION_KEY is required');
  });

  it('throws without DATABASE_URL', () => {
    expect(() =>
      buildAppConfig({ ...baseEnv, DATABASE_URL: undefined }),
    ).toThrow('DATABASE_URL is required');
  });
});
