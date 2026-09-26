import {
  buildSchedulingPostsConfig,
  validateSchedulingPostsConfig,
} from './app.config';

describe('buildSchedulingPostsConfig', () => {
  it('defaults to port 4080 with gateway-only publishing', () => {
    const cfg = buildSchedulingPostsConfig({});
    expect(cfg.port).toBe(4080);
    expect(cfg.enabled).toBe(false);
    expect(cfg.apiKey).toBe('');
    expect(cfg.gateway.baseUrl).toBe('http://localhost:4070');
    expect(cfg.cronEnabled).toBe(true);
    expect(cfg.rateLimitPerMin).toBe(10);
  });

  it('reads the triplet overrides from env', () => {
    const cfg = buildSchedulingPostsConfig({
      SCHEDULING_POSTS_PORT: '4081',
      SCHEDULING_POSTS_ENABLED: 'true',
      SCHEDULING_POSTS_API_KEY: 'k',
      BOTS_GATEWAY_URL: 'http://localhost:4071/',
      BOTS_GATEWAY_CLIENT_ID: 'id',
      BOTS_GATEWAY_CLIENT_SECRET: 'secret',
      SESSION_CALLBACK_URL: 'http://localhost:3040/api/scheduler-callbacks',
      SESSION_CALLBACK_API_KEY: 'cb',
      SCHEDULING_CRON_ENABLED: 'false',
      PUBLISH_RATE_LIMIT_PER_MIN: '25',
      SCHEDULING_POSTS_UPLOADS_ROOT: '/data/uploads',
    } as NodeJS.ProcessEnv);
    expect(cfg.port).toBe(4081);
    expect(cfg.enabled).toBe(true);
    expect(cfg.apiKey).toBe('k');
    expect(cfg.gateway.baseUrl).toBe('http://localhost:4071');
    expect(cfg.gateway.clientId).toBe('id');
    expect(cfg.gateway.clientSecret).toBe('secret');
    expect(cfg.sessionCallback.url).toBe(
      'http://localhost:3040/api/scheduler-callbacks',
    );
    expect(cfg.sessionCallback.apiKey).toBe('cb');
    expect(cfg.cronEnabled).toBe(false);
    expect(cfg.rateLimitPerMin).toBe(25);
    expect(cfg.uploadsRoot).toBe('/data/uploads');
  });
});

describe('validateSchedulingPostsConfig', () => {
  it('throws Tier-1 when DATABASE_URL is missing', () => {
    expect(() =>
      validateSchedulingPostsConfig({} as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL/);
  });

  it('passes with DATABASE_URL set and warns on empty optionals', () => {
    const { warnings } = validateSchedulingPostsConfig({
      DATABASE_URL: 'postgres://localhost:5442/onchain_bot_scheduling',
    } as NodeJS.ProcessEnv);
    expect(warnings.join(' ')).toMatch(/SCHEDULING_POSTS_API_KEY/);
  });
});
