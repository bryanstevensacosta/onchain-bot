import { buildDatabaseConfig } from './database.config';

describe('buildDatabaseConfig', () => {
  it('defaults to the scheduling dev database with synchronize off', () => {
    const cfg = buildDatabaseConfig({});
    expect(cfg.url).toBe(
      'postgres://onchain_bot:onchain_bot@localhost:5432/scheduling_posts_db',
    );
    expect(cfg.synchronize).toBe(false);
    expect(cfg.logging).toBe(false);
  });

  it('reads overrides from env', () => {
    const cfg = buildDatabaseConfig({
      DATABASE_URL: 'postgres://localhost:5432/scheduling_posts_db_staging',
      DATABASE_SYNCHRONIZE: 'true',
      DATABASE_LOGGING: 'true',
    });
    expect(cfg.url).toBe(
      'postgres://localhost:5432/scheduling_posts_db_staging',
    );
    expect(cfg.synchronize).toBe(true);
    expect(cfg.logging).toBe(true);
  });
});
