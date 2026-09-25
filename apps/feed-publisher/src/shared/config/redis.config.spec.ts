import { buildRedisConfig } from './redis.config';

describe('redis config', () => {
  it('defaults to the feed-publisher dev redis', () => {
    expect(buildRedisConfig({} as NodeJS.ProcessEnv).url).toBe(
      'redis://localhost:6383/0',
    );
  });
});
