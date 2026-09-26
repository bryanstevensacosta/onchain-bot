import { buildDatabaseConfig } from './database.config';

describe('buildDatabaseConfig', () => {
  it('honors DATABASE_URL and flags', () => {
    const cfg = buildDatabaseConfig({
      DATABASE_URL: 'postgres://localhost:5432/kol',
      DATABASE_SYNCHRONIZE: 'true',
      DATABASE_LOGGING: 'true',
    });
    expect(cfg.url).toBe('postgres://localhost:5432/kol');
    expect(cfg.synchronize).toBe(true);
    expect(cfg.logging).toBe(true);
  });

  it('defaults to empty url with flags off', () => {
    const cfg = buildDatabaseConfig({});
    expect(cfg.url).toBe('');
    expect(cfg.synchronize).toBe(false);
    expect(cfg.logging).toBe(false);
  });
});
