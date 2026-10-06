import {
  deriveSnapshotNullReason,
  SnapshotNullMetricsService,
} from './snapshot-null-metrics.service';

/**
 * Null-reason counter (plan todo 19a, metric only): derivation +
 * in-process counts. No cron, no scan — the runbook line lives in
 * `apps/market-data/AGENTS.md` (pending semantics).
 */
describe('SnapshotNullMetricsService', () => {
  it('derives cached whenever the shell was served from cache', () => {
    expect(
      deriveSnapshotNullReason({ servedFromCache: true, providerErrors: {} }),
    ).toBe('cached');
    expect(
      deriveSnapshotNullReason({
        servedFromCache: true,
        providerErrors: { dexscreener: 'no data' },
      }),
    ).toBe('cached');
  });

  it('derives no-market only when every provider honestly found nothing', () => {
    expect(
      deriveSnapshotNullReason({
        servedFromCache: false,
        providerErrors: { dexscreener: 'no data', geckoterminal: 'no data' },
      }),
    ).toBe('no-market');
  });

  it('derives transient on any throw, timeout, or outbound-deny', () => {
    expect(
      deriveSnapshotNullReason({
        servedFromCache: false,
        providerErrors: { dexscreener: 'no data', geckoterminal: 'boom' },
      }),
    ).toBe('transient');
    expect(
      deriveSnapshotNullReason({
        servedFromCache: false,
        providerErrors: {
          dexscreener:
            'dexscreener outbound budget exceeded (60/min, cost 1) — skipped, fail-open',
        },
      }),
    ).toBe('transient');
    expect(
      deriveSnapshotNullReason({ servedFromCache: false, providerErrors: {} }),
    ).toBe('transient');
  });

  it('counts records per reason, zeros by default', () => {
    const metrics = new SnapshotNullMetricsService();
    expect(metrics.snapshot()).toEqual({
      'no-market': 0,
      transient: 0,
      cached: 0,
    });
    metrics.record('transient');
    metrics.record('transient');
    metrics.record('no-market');
    expect(metrics.snapshot()).toEqual({
      'no-market': 1,
      transient: 2,
      cached: 0,
    });
  });
});
