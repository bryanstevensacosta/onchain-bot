import { buildDatabaseConfig } from './database.config';

describe('database config', () => {
  it('defaults to the feed-publisher dev DB', () => {
    expect(buildDatabaseConfig({} as NodeJS.ProcessEnv).url).toContain(
      'onchain_bot_feed_publisher',
    );
  });

  it('reads DATABASE_URL + synchronize flag', () => {
    const config = buildDatabaseConfig({
      DATABASE_URL: 'postgres://x/y',
      DATABASE_SYNCHRONIZE: 'true',
    } as NodeJS.ProcessEnv);
    expect(config.url).toBe('postgres://x/y');
    expect(config.synchronize).toBe(true);
  });
});
