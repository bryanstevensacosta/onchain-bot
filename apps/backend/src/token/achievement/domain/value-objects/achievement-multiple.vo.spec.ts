import { AchievementMultiple } from './achievement-multiple.vo';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

describe('AchievementMultiple', () => {
  it('creates VO from finite number > 1', () => {
    const vo = AchievementMultiple.fromNumber(2.5);
    expect(vo.value).toBe(2.5);
  });

  it('rejects negative numbers', () => {
    expect(() => AchievementMultiple.fromNumber(-1)).toThrow(DomainError);
    expect(() => AchievementMultiple.fromNumber(-1)).toThrow(
      expect.objectContaining({ code: ErrorCode.VALIDATION }),
    );
  });

  it('rejects zero', () => {
    expect(() => AchievementMultiple.fromNumber(0)).toThrow(DomainError);
  });

  it('rejects one (must be > 1)', () => {
    expect(() => AchievementMultiple.fromNumber(1)).toThrow(DomainError);
  });

  it('rejects NaN', () => {
    expect(() => AchievementMultiple.fromNumber(Number.NaN)).toThrow(DomainError);
  });

  it('rejects Infinity', () => {
    expect(() =>
      AchievementMultiple.fromNumber(Number.POSITIVE_INFINITY),
    ).toThrow(DomainError);
  });

  it('accepts integer multiples (e.g. 2, 50, 100)', () => {
    expect(AchievementMultiple.fromNumber(2).value).toBe(2);
    expect(AchievementMultiple.fromNumber(50).value).toBe(50);
    expect(AchievementMultiple.fromNumber(100).value).toBe(100);
  });

  it('two VOs with the same value are equal', () => {
    const a = AchievementMultiple.fromNumber(2.5);
    const b = AchievementMultiple.fromNumber(2.5);
    expect(a.equals(b)).toBe(true);
  });

  it('two VOs with different values are not equal', () => {
    const a = AchievementMultiple.fromNumber(2);
    const b = AchievementMultiple.fromNumber(3);
    expect(a.equals(b)).toBe(false);
  });
});
