import {
  QUOTA_GOVERNOR_TIER,
  QuotaGovernorService,
  governorLevelFor,
  governorShedTiers,
  isGovernorQuotaEvent,
  quotaGovernorTierOf,
  resolveGovernorThresholds,
  GOVERNOR_L1_MISS_PER_MIN,
  GOVERNOR_L1_OPEN_BREAKERS,
  GOVERNOR_L1_QUOTA_EVENTS_PER_MIN,
  GOVERNOR_L2_MISS_PER_MIN,
  GOVERNOR_L2_OPEN_BREAKERS,
  GOVERNOR_L2_QUOTA_EVENTS_PER_MIN,
} from './quota-governor.service';

describe('QuotaGovernorService tiers (plan todo 41d)', () => {
  it('keeps Tier-0 (keyless primaries) unsheddable and sheds keyed first', () => {
    expect(QUOTA_GOVERNOR_TIER['dexscreener']).toBe(0);
    expect(QUOTA_GOVERNOR_TIER['geckoterminal']).toBe(0);
    for (const name of ['solana-rpc', 'rugcheck', 'defillama', 'ccxt']) {
      expect(quotaGovernorTierOf(name)).toBe(1);
    }
    for (const name of [
      'birdeye',
      'coingecko',
      'mobula',
      'moralis',
      'etherscan',
    ]) {
      expect(quotaGovernorTierOf(name)).toBe(2);
    }
    // Unknown future legs land in the middle (never last-resort, never first-shed).
    expect(quotaGovernorTierOf('some-future-leg')).toBe(1);
    // Shed order: Tier-2 off first, Tier-0-from-cache asymptote at L2.
    expect(governorShedTiers(0)).toEqual([]);
    expect(governorShedTiers(1)).toEqual([2]);
    expect(governorShedTiers(2)).toEqual([1, 2]);
  });

  it('pins the pressure thresholds (headroom math 2026-10-11)', () => {
    expect(GOVERNOR_L1_OPEN_BREAKERS).toBe(2);
    expect(GOVERNOR_L2_OPEN_BREAKERS).toBe(4);
    expect(GOVERNOR_L1_QUOTA_EVENTS_PER_MIN).toBe(10);
    expect(GOVERNOR_L2_QUOTA_EVENTS_PER_MIN).toBe(30);
    expect(GOVERNOR_L1_MISS_PER_MIN).toBe(30);
    expect(GOVERNOR_L2_MISS_PER_MIN).toBe(90);
  });
});

describe('governorLevelFor (pure pressure matrix)', () => {
  const thresholds = resolveGovernorThresholds({});

  it('is L0 when every signal is quiet', () => {
    expect(
      governorLevelFor(
        { openBreakers: 0, quotaEventsPerMin: 0, missPerMin: 0 },
        thresholds,
      ),
    ).toBe(0);
    expect(
      governorLevelFor(
        { openBreakers: 1, quotaEventsPerMin: 9, missPerMin: 29 },
        thresholds,
      ),
    ).toBe(0);
  });

  it('is L1 on any single L1 signal (breaker / 429s / miss rate)', () => {
    expect(
      governorLevelFor(
        { openBreakers: 2, quotaEventsPerMin: 0, missPerMin: 0 },
        thresholds,
      ),
    ).toBe(1);
    expect(
      governorLevelFor(
        { openBreakers: 0, quotaEventsPerMin: 10, missPerMin: 0 },
        thresholds,
      ),
    ).toBe(1);
    expect(
      governorLevelFor(
        { openBreakers: 0, quotaEventsPerMin: 0, missPerMin: 30 },
        thresholds,
      ),
    ).toBe(1);
  });

  it('is L2 on any single L2 signal', () => {
    expect(
      governorLevelFor(
        { openBreakers: 4, quotaEventsPerMin: 0, missPerMin: 0 },
        thresholds,
      ),
    ).toBe(2);
    expect(
      governorLevelFor(
        { openBreakers: 0, quotaEventsPerMin: 30, missPerMin: 0 },
        thresholds,
      ),
    ).toBe(2);
    expect(
      governorLevelFor(
        { openBreakers: 0, quotaEventsPerMin: 0, missPerMin: 90 },
        thresholds,
      ),
    ).toBe(2);
  });

  it('honors env overrides with fallback on garbage', () => {
    const custom = resolveGovernorThresholds({
      GOVERNOR_L1_MISS_PER_MIN: '5',
      GOVERNOR_L2_MISS_PER_MIN: 'garbage',
    });
    expect(custom.l1MissPerMin).toBe(5);
    expect(custom.l2MissPerMin).toBe(GOVERNOR_L2_MISS_PER_MIN);
  });
});

describe('isGovernorQuotaEvent (429 metric taxonomy)', () => {
  it('counts outbound-deny + 429/rate-limit text as pressure', () => {
    expect(
      isGovernorQuotaEvent(
        'dexscreener',
        'dexscreener outbound budget exceeded (60/min, cost 1) — skipped, fail-open',
      ),
    ).toBe(true);
    expect(isGovernorQuotaEvent('geckoterminal', 'http 429')).toBe(true);
    expect(
      isGovernorQuotaEvent('birdeye', 'rate limited, retry after 2s'),
    ).toBe(true);
  });

  it('ignores honest empties, tail latency and its own audit notes (no feedback latch)', () => {
    expect(isGovernorQuotaEvent('dexscreener', 'no data')).toBe(false);
    expect(
      isGovernorQuotaEvent(
        'tail:launchpad',
        'timeout (tail budget 400ms) — degraded to null, fail-open',
      ),
    ).toBe(false);
    expect(
      isGovernorQuotaEvent(
        'governor:shed-tier-2',
        'skipped birdeye at pressure L1 (429 rate) — Tier-0 live, fail-open',
      ),
    ).toBe(false);
  });
});

describe('QuotaGovernorService rolling windows', () => {
  it('admits all when quiet and sheds Tier-2 under driven pressure', () => {
    const governor = new QuotaGovernorService();
    const now = Date.now();
    expect(governor.evaluate(0, now).level).toBe(0);
    // Drive 30 MISS/min through the same window.
    for (let i = 0; i < 29; i += 1) {
      governor.evaluate(0, now);
    }
    const pressured = governor.evaluate(0, now);
    expect(pressured.level).toBe(1);
    expect(pressured.skipTiers).toEqual([2]);
    // Quota events alone (no traffic) also trip L1 at 10/min.
    const quiet = new QuotaGovernorService();
    for (let i = 0; i < 10; i += 1) {
      quiet.observe({ dexscreener: 'http 429' }, now);
    }
    expect(quiet.evaluate(0, now).level).toBe(1);
  });

  it('slides the window (old pressure decays without new signal)', () => {
    const governor = new QuotaGovernorService();
    const now = Date.now();
    for (let i = 0; i < 30; i += 1) {
      governor.evaluate(0, now);
    }
    expect(governor.evaluate(0, now).level).toBe(1);
    // 61s later the window is empty again.
    expect(governor.snapshot(now + 61_000)).toMatchObject({
      missPerMin: 0,
      quotaEventsPerMin: 0,
      level: 0,
    });
  });

  it('never throws out of observe (metric-only)', () => {
    const governor = new QuotaGovernorService();
    expect(() => governor.observe(null as never)).not.toThrow();
  });
});
