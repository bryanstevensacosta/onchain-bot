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
      },
    });
    expect(config.enabled).toBe(false);
    expect(config.everyNPosts).toBe(5);
    expect(config.limitsFor('telegram').toSnapshot()).toEqual({
      delayMinMs: 90000,
      delayMaxMs: 90000,
      dailyCap: 7,
      resetHour: 0,
    });
    expect(config.limitsFor('threads').toSnapshot()).toEqual({
      delayMinMs: 120000,
      delayMaxMs: 120000,
      dailyCap: 3,
      resetHour: 0,
    });
  });

  it('falls back to built-in defaults on empty env', () => {
    const config = SchedulingConfig.load({ env: {} });
    expect(config.enabled).toBe(false);
    expect(config.limitsFor('telegram').delayMinMs).toBe(60_000);
    expect(config.limitsFor('telegram').delayMaxMs).toBe(60_000);
    expect(config.limitsFor('telegram').dailyCap).toBe(20);
    expect(config.limitsFor('telegram').resetHour).toBe(0);
    expect(config.limitsFor('threads').dailyCap).toBe(20);
  });

  it('keeps the legacy scalar working (old route: min = max = publishDelayMs)', () => {
    const config = SchedulingConfig.load({
      env: {},
      telegram: { publishDelayMs: 5000, dailyCap: 2 },
    });
    expect(config.limitsFor('telegram').toSnapshot()).toEqual({
      delayMinMs: 5000,
      delayMaxMs: 5000,
      dailyCap: 2,
      resetHour: 0,
    });
    expect(config.legacyLimitsFor('telegram')).toEqual({
      publishDelayMs: 5000,
      dailyCap: 2,
    });
  });

  it('patches one target without touching the sibling', () => {
    const config = SchedulingConfig.load({ env: {} });
    const next = config.update({
      enabled: true,
      telegram: { dailyCap: 1, delayMinMs: 1000, delayMaxMs: 2000 },
    });
    expect(next.enabled).toBe(true);
    expect(next.limitsFor('telegram').dailyCap).toBe(1);
    expect(next.limitsFor('telegram').delayMinMs).toBe(1000);
    expect(next.limitsFor('telegram').delayMaxMs).toBe(2000);
    expect(next.limitsFor('threads').dailyCap).toBe(20);
    expect(config.enabled).toBe(false);
  });

  it('rejects negative delays and caps', () => {
    const config = SchedulingConfig.load({ env: {} });
    expect(() => config.update({ telegram: { publishDelayMs: -1 } })).toThrow(
      />= 0/,
    );
    expect(() => config.update({ threads: { dailyCap: -1 } })).toThrow(
      /dailyCap/,
    );
    expect(() => config.update({ everyNPosts: 0 })).toThrow(/everyNPosts/);
  });

  it('coerces legacy snapshots (scalar + missing resetHour)', () => {
    const config = SchedulingConfig.fromSnapshot({
      id: 1,
      enabled: true,
      everyNPosts: 4,
      minMinutesBetweenAds: 30,
      telegram: { publishDelayMs: 5000, dailyCap: 2 },
      threads: { publishDelayMs: 5000, dailyCap: 2 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(config.limitsFor('telegram').delayMaxMs).toBe(5000);
    expect(config.limitsFor('telegram').resetHour).toBe(0);
  });
});
