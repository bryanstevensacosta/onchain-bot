import { SchedulingConfig } from './scheduling-config.entity';

describe('SchedulingConfig', () => {
  it('seeds fail-closed with per-target P38 defaults from env', () => {
    const config = SchedulingConfig.load({
      env: {
        ADS_ROTATION_EVERY_N: '5',
        SCHEDULING_TELEGRAM_PUBLISH_DELAY_MS: '90000',
        SCHEDULING_TELEGRAM_DAILY_CAP: '7',
        SCHEDULING_THREADS_PUBLISH_DELAY_MS: '120000',
        SCHEDULING_THREADS_DAILY_CAP: '3',
      } as NodeJS.ProcessEnv,
    });
    expect(config.enabled).toBe(false);
    expect(config.everyNPosts).toBe(5);
    expect(config.limitsFor('telegram')).toEqual({
      publishDelayMs: 90000,
      dailyCap: 7,
    });
    expect(config.limitsFor('threads')).toEqual({
      publishDelayMs: 120000,
      dailyCap: 3,
    });
  });

  it('falls back to built-in defaults on empty env', () => {
    const config = SchedulingConfig.load({ env: {} as NodeJS.ProcessEnv });
    expect(config.enabled).toBe(false);
    expect(config.limitsFor('telegram').publishDelayMs).toBe(60_000);
    expect(config.limitsFor('telegram').dailyCap).toBe(20);
    expect(config.limitsFor('threads').dailyCap).toBe(20);
  });

  it('patches one target without touching the sibling', () => {
    const config = SchedulingConfig.load({ env: {} as NodeJS.ProcessEnv });
    const next = config.update({
      enabled: true,
      telegram: { dailyCap: 1 },
    });
    expect(next.enabled).toBe(true);
    expect(next.limitsFor('telegram').dailyCap).toBe(1);
    expect(next.limitsFor('telegram').publishDelayMs).toBe(60_000);
    expect(next.limitsFor('threads').dailyCap).toBe(20);
    expect(config.enabled).toBe(false);
  });

  it('rejects negative delays and caps', () => {
    const config = SchedulingConfig.load({ env: {} as NodeJS.ProcessEnv });
    expect(() => config.update({ telegram: { publishDelayMs: -1 } })).toThrow(
      /publishDelayMs/,
    );
    expect(() => config.update({ threads: { dailyCap: -1 } })).toThrow(
      /dailyCap/,
    );
    expect(() => config.update({ everyNPosts: 0 })).toThrow(/everyNPosts/);
  });
});
