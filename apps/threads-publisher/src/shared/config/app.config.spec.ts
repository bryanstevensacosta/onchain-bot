import { buildThreadsPublisherConfig, validateThreadsPublisherConfig } from './app.config';

describe('threads-publisher config', () => {
  it('defaults to port 4100 and dev DB', () => {
    const cfg = buildThreadsPublisherConfig({} as never);
    expect(cfg.port).toBe(4100);
    expect(cfg.databaseUrl).toMatch('onchain_bot_threads');
  });

  it('rejects synchronize in staging', () => {
    expect(() =>
      validateThreadsPublisherConfig({
        NODE_ENV: 'staging',
        DATABASE_SYNCHRONIZE: 'true',
      } as never),
    ).toThrow('DATABASE_SYNCHRONIZE');
  });
});
