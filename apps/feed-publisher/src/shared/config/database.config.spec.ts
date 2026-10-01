import { buildDatabaseConfig } from './database.config';

describe('database config', () => {
  it('defaults to the feed-publisher dev DB', () => {
    expect(buildDatabaseConfig({}).url).toContain('feed_publisher_db');
  });

  it('reads DATABASE_URL + synchronize flag', () => {
    const config = buildDatabaseConfig({
      DATABASE_URL: 'postgres://x/y',
      DATABASE_SYNCHRONIZE: 'true',
    });
    expect(config.url).toBe('postgres://x/y');
    expect(config.synchronize).toBe(true);
  });
});
