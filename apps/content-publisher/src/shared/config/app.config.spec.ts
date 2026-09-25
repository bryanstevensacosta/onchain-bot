import { buildAppConfig, validateAppConfig } from './app.config';

describe('app config', () => {
  it('builds defaults (dev port 3040)', () => {
    const config = buildAppConfig({} as NodeJS.ProcessEnv);
    expect(config.port).toBe(3040);
    expect(config.nodeEnv).toBe('development');
  });

  it('reads CONTENT_PUBLISHER_PORT', () => {
    const config = buildAppConfig({
      CONTENT_PUBLISHER_PORT: '3041',
    } as NodeJS.ProcessEnv);
    expect(config.port).toBe(3041);
  });

  it('rejects missing tier-1 vars', () => {
    expect(() => validateAppConfig({} as NodeJS.ProcessEnv)).toThrow(
      'Invalid content-publisher config',
    );
  });

  it('passes with tier-1 vars present', () => {
    expect(() =>
      validateAppConfig({
        ENCRYPTION_KEY: 'x',
        DATABASE_URL: 'postgres://localhost/db',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
