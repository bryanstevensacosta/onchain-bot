import { buildRedisConfig } from './redis.config';

describe('buildRedisConfig', () => {
  it('honors REDIS_URL/HOST/PORT', () => {
    const cfg = buildRedisConfig({
      REDIS_URL: 'redis://localhost:6379',
      REDIS_HOST: 'redis',
      REDIS_PORT: '6380',
    });
    expect(cfg.url).toBe('redis://localhost:6379');
    expect(cfg.host).toBe('redis');
    expect(cfg.port).toBe(6380);
  });

  it('defaults to localhost:6379 with empty url', () => {
    const cfg = buildRedisConfig({});
    expect(cfg).toEqual({ url: '', host: 'localhost', port: 6379 });
  });

  it('falls back to 6379 on non-numeric port', () => {
    expect(buildRedisConfig({ REDIS_PORT: 'nope' }).port).toBe(6379);
  });
});
