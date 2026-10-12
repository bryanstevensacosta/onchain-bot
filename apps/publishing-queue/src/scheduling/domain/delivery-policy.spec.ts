import {
  DeliveryPolicy,
  createDeliveryEta,
  isLate,
} from './delivery-policy';

/**
 * R-c DeliveryPolicy seam (failing-first): per-target value object
 * `{delayMinMs, delayMaxMs, dailyCap, resetHour}` with `rollDelayMs()`,
 * `createDeliveryEta`, validators (ints >= 0, min <= max), and the A4
 * legacy split (`fromLegacy`: min = max = publishDelayMs).
 */
describe('DeliveryPolicy (R-c)', () => {
  it('seeds frozen defaults on empty input', () => {
    const policy = DeliveryPolicy.load({});
    expect(policy.delayMinMs).toBe(60_000);
    expect(policy.delayMaxMs).toBe(60_000);
    expect(policy.dailyCap).toBe(20);
    expect(policy.resetHour).toBe(0);
  });

  it('splits the legacy scalar via fromLegacy (A4: min = max = publishDelayMs)', () => {
    const policy = DeliveryPolicy.fromLegacy({
      publishDelayMs: 5_000,
      dailyCap: 2,
    });
    expect(policy.delayMinMs).toBe(5_000);
    expect(policy.delayMaxMs).toBe(5_000);
    expect(policy.dailyCap).toBe(2);
    expect(policy.resetHour).toBe(0);
  });

  it('seeds resetHour from the legacy dailyResetUtcHour, else 0 UTC (A4)', () => {
    expect(
      DeliveryPolicy.fromLegacy({
        publishDelayMs: 5_000,
        dailyCap: 2,
        resetHour: 7,
      }).resetHour,
    ).toBe(7);
    expect(
      DeliveryPolicy.fromLegacy({ publishDelayMs: 5_000, dailyCap: 2 })
        .resetHour,
    ).toBe(0);
  });

  it('rejects negative, non-integer, and inverted bounds', () => {
    expect(() => DeliveryPolicy.load({ delayMinMs: -1 })).toThrow(/>= 0/);
    expect(() => DeliveryPolicy.load({ delayMaxMs: -1 })).toThrow(/>= 0/);
    expect(() => DeliveryPolicy.load({ dailyCap: -1 })).toThrow(/>= 0/);
    expect(() => DeliveryPolicy.load({ dailyCap: 1.5 })).toThrow(/integer/);
    expect(() => DeliveryPolicy.load({ resetHour: -1 })).toThrow(/>= 0/);
    expect(() =>
      DeliveryPolicy.load({ delayMinMs: 5_000, delayMaxMs: 1_000 }),
    ).toThrow(/min.*max|<=/);
  });

  it('rollDelayMs(rng) rolls within [min, max] deterministically', () => {
    const policy = DeliveryPolicy.load({
      delayMinMs: 1_000,
      delayMaxMs: 5_000,
    });
    expect(policy.rollDelayMs(() => 0)).toBe(1_000);
    expect(policy.rollDelayMs(() => 0.5)).toBe(3_000);
    const top = policy.rollDelayMs(() => 0.9999);
    expect(top).toBeGreaterThanOrEqual(1_000);
    expect(top).toBeLessThanOrEqual(5_000);
  });

  it('createDeliveryEta pins deadlineAt = now + etaMs', () => {
    const now = new Date('2026-10-06T00:00:00.000Z');
    const { etaMs, deadlineAt } = createDeliveryEta({
      delayMinMs: 60_000,
      delayMaxMs: 60_000,
      now,
      rng: () => 0.5,
    });
    expect(etaMs).toBe(60_000);
    expect(deadlineAt).toEqual(new Date('2026-10-06T00:01:00.000Z'));
  });

  it('isLate flags posts past their deadline (null deadline never late)', () => {
    expect(isLate(null, new Date())).toBe(false);
    expect(
      isLate(
        new Date('2026-10-06T00:01:00.000Z'),
        new Date('2026-10-06T00:02:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isLate(
        new Date('2026-10-06T00:01:00.000Z'),
        new Date('2026-10-06T00:00:30.000Z'),
      ),
    ).toBe(false);
  });

  it('update() patches one knob immutably', () => {
    const policy = DeliveryPolicy.load({});
    const next = policy.update({ dailyCap: 1 });
    expect(next.dailyCap).toBe(1);
    expect(next.delayMinMs).toBe(60_000);
    expect(policy.dailyCap).toBe(20);
  });

  it('update() rejects inverted ranges', () => {
    const policy = DeliveryPolicy.load({});
    expect(() => policy.update({ delayMinMs: 90_000 })).toThrow(/min.*max|<=/);
  });
});
