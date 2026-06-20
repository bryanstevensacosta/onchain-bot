import { recomputeStats } from 'ca/analytics/application/handlers/evaluate-call-performance.use-case';
import { CallPerformance } from 'ca/analytics/domain/value-objects/call-performance.vo';
import { Outcome } from 'ca/analytics/domain/value-objects/outcome.vo';

const TOKEN = 'ethereum:0xabc';

function buildPerf(
  channelId: string,
  outcome: Outcome,
  athMultiple: number | null = null,
): CallPerformance {
  return CallPerformance.create({
    channelId,
    tokenId: TOKEN,
    outcome,
    mcAtCall: 100_000,
    athMultiple,
    callTimestamp: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('recomputeStats', () => {
  it('returns empty defaults for a channel with no history', () => {
    const stats = recomputeStats('chan', []);
    expect(stats.totalCalls).toBe(0);
    expect(stats.score).toBe(0.5);
    expect(stats.confidence).toBe('LOW');
    expect(stats.successRate()).toBe(0);
  });

  it('scores a perfect channel highly', () => {
    const perfs = Array.from({ length: 10 }, () =>
      buildPerf('chan', Outcome.STRONG, 6),
    );
    const stats = recomputeStats('chan', perfs);
    expect(stats.totalCalls).toBe(10);
    expect(stats.strongCalls).toBe(10);
    expect(stats.score).toBe(1.0);
    expect(stats.confidence).toBe('MEDIUM');
    expect(stats.successRate()).toBe(1);
  });

  it('scores a failing channel low', () => {
    const perfs = Array.from({ length: 10 }, () =>
      buildPerf('chan', Outcome.FAILED, 0.05),
    );
    const stats = recomputeStats('chan', perfs);
    expect(stats.score).toBeLessThanOrEqual(0.2);
    expect(stats.failedCalls).toBe(10);
  });

  it('classifies confidence by total calls', () => {
    expect(recomputeStats('a', []).confidence).toBe('LOW');
    expect(
      recomputeStats(
        'a',
        Array(4)
          .fill(0)
          .map(() => buildPerf('a', Outcome.GOOD)),
      ).confidence,
    ).toBe('LOW');
    expect(
      recomputeStats(
        'a',
        Array(5)
          .fill(0)
          .map(() => buildPerf('a', Outcome.GOOD)),
      ).confidence,
    ).toBe('MEDIUM');
    expect(
      recomputeStats(
        'a',
        Array(20)
          .fill(0)
          .map(() => buildPerf('a', Outcome.GOOD)),
      ).confidence,
    ).toBe('HIGH');
    expect(
      recomputeStats(
        'a',
        Array(50)
          .fill(0)
          .map(() => buildPerf('a', Outcome.GOOD)),
      ).confidence,
    ).toBe('VERY_HIGH');
  });

  it('averages ATH multiple across all calls', () => {
    const perfs = [
      buildPerf('chan', Outcome.STRONG, 4),
      buildPerf('chan', Outcome.STRONG, 6),
      buildPerf('chan', Outcome.GOOD, 2),
    ];
    const stats = recomputeStats('chan', perfs);
    expect(stats.avgAthMultiple).toBeCloseTo(4, 1);
  });

  it('skips null ATH values in average', () => {
    const perfs = [
      buildPerf('chan', Outcome.STRONG, 4),
      buildPerf('chan', Outcome.NEUTRAL, null),
      buildPerf('chan', Outcome.GOOD, 6),
    ];
    const stats = recomputeStats('chan', perfs);
    expect(stats.avgAthMultiple).toBe(5); // (4 + 6) / 2
  });

  it('counts each outcome bucket correctly', () => {
    const perfs = [
      buildPerf('chan', Outcome.STRONG),
      buildPerf('chan', Outcome.GOOD),
      buildPerf('chan', Outcome.GOOD),
      buildPerf('chan', Outcome.NEUTRAL),
      buildPerf('chan', Outcome.POOR),
      buildPerf('chan', Outcome.FAILED),
    ];
    const stats = recomputeStats('chan', perfs);
    expect(stats.strongCalls).toBe(1);
    expect(stats.goodCalls).toBe(2);
    expect(stats.neutralCalls).toBe(1);
    expect(stats.poorCalls).toBe(1);
    expect(stats.failedCalls).toBe(1);
  });

  it('mixed outcomes yield score between 0 and 1', () => {
    const perfs = [
      buildPerf('chan', Outcome.STRONG),
      buildPerf('chan', Outcome.FAILED),
      buildPerf('chan', Outcome.NEUTRAL),
      buildPerf('chan', Outcome.GOOD),
    ];
    const stats = recomputeStats('chan', perfs);
    expect(stats.score).toBeGreaterThan(0.3);
    expect(stats.score).toBeLessThan(0.7);
  });
});
