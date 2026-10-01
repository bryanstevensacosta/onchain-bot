import { CronDueChecker } from './cron-due.checker';

describe('CronDueChecker', () => {
  it('accepts 5-field UTC cron and rejects anything else', () => {
    expect(() => CronDueChecker.assertValid('0 8 * * *')).not.toThrow();
    expect(() => CronDueChecker.assertValid('*/15 9-17 * * 1-5')).not.toThrow();
    expect(() => CronDueChecker.assertValid('0 8 * *')).toThrow(/5-field/);
    expect(() => CronDueChecker.assertValid('0 8 * * * *')).toThrow(/5-field/);
    expect(() => CronDueChecker.assertValid('61 8 * * *')).toThrow();
    expect(() => CronDueChecker.assertValid('0 25 * * *')).toThrow();
    expect(() => CronDueChecker.assertValid('abc * * * *')).toThrow();
  });

  it('matches due minutes in UTC (contract: dayKeys UTC everywhere)', () => {
    const at = new Date('2026-09-27T08:00:30.000Z');
    expect(CronDueChecker.isDue('0 8 * * *', at)).toBe(true);
    expect(CronDueChecker.isDue('30 8 * * *', at)).toBe(false);
    expect(CronDueChecker.isDue('* * * * *', at)).toBe(true);
    expect(CronDueChecker.isDue('0 8 * * 1', at)).toBe(false);
  });

  it('supports steps, ranges and lists', () => {
    const at = new Date('2026-09-27T08:30:00.000Z');
    expect(CronDueChecker.isDue('*/15 * * * *', at)).toBe(true);
    expect(CronDueChecker.isDue('*/20 * * * *', at)).toBe(false);
    expect(CronDueChecker.isDue('0-30 8 * * *', at)).toBe(true);
    expect(CronDueChecker.isDue('0,30 8 * * *', at)).toBe(true);
    expect(CronDueChecker.isDue('15,45 8 * * *', at)).toBe(false);
  });
});
