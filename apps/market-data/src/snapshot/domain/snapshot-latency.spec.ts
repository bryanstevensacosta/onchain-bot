import {
  SNAPSHOT_EXISTENCE_DEADLINE_MS_DEFAULT,
  SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT,
  SNAPSHOT_PENDING_AGING_N_DEFAULT,
  SNAPSHOT_PENDING_AGING_WINDOW_MS_DEFAULT,
  SNAPSHOT_SWR_MIN_AGE_MS,
  agingEscalationNote,
  resolveExistenceDeadlineMs,
  resolveFanoutDeadlineMs,
  resolvePendingAgingN,
  resolvePendingAgingWindowMs,
  swrNowNote,
} from './snapshot-latency';
import { SNAPSHOT_NUMBERS_TTL_SECONDS } from './snapshot-ttl-policy';
import { isGovernorQuotaEvent } from '../application/quota-governor.service';

/**
 * Latency budget (dexter plan todo 21) — pure domain pins: the four
 * read-once knobs, their defaults, the env resolvers, and the two
 * audit notes' governor-cleanliness (a latency serve must never count
 * as quota pressure — `isGovernorQuotaEvent` is the same predicate the
 * governor actually uses, not a copy).
 */
describe('snapshot latency budget (plan todo 21)', () => {
  describe('defaults', () => {
    it('SWR lower bound is exactly one numbers-TTL window', () => {
      expect(SNAPSHOT_SWR_MIN_AGE_MS).toBe(
        SNAPSHOT_NUMBERS_TTL_SECONDS * 1000,
      );
      expect(SNAPSHOT_SWR_MIN_AGE_MS).toBe(30_000);
    });

    it('fan-out deadline default is the pinned 4s', () => {
      expect(SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT).toBe(4_000);
    });

    it('existence deadline default is the pinned 800ms', () => {
      expect(SNAPSHOT_EXISTENCE_DEADLINE_MS_DEFAULT).toBe(800);
    });

    it('aging defaults are N=3 consecutive pendings within 10 minutes', () => {
      expect(SNAPSHOT_PENDING_AGING_N_DEFAULT).toBe(3);
      expect(SNAPSHOT_PENDING_AGING_WINDOW_MS_DEFAULT).toBe(600_000);
    });
  });

  describe('read-once resolvers', () => {
    it.each([
      [undefined, SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT],
      ['', SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT],
      ['nope', SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT],
      ['0', SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT],
      ['-5', SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT],
      ['Infinity', SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT],
      ['1500.9', 1500],
      ['250', 250],
    ])('fanout %s -> %s', (raw, expected) => {
      expect(resolveFanoutDeadlineMs(raw as string | undefined)).toBe(expected);
    });

    it.each([
      [undefined, SNAPSHOT_EXISTENCE_DEADLINE_MS_DEFAULT],
      ['', SNAPSHOT_EXISTENCE_DEADLINE_MS_DEFAULT],
      ['-1', SNAPSHOT_EXISTENCE_DEADLINE_MS_DEFAULT],
      ['50', 50],
    ])('existence %s -> %s', (raw, expected) => {
      expect(resolveExistenceDeadlineMs(raw as string | undefined)).toBe(
        expected,
      );
    });

    it.each([
      [undefined, SNAPSHOT_PENDING_AGING_N_DEFAULT],
      ['', SNAPSHOT_PENDING_AGING_N_DEFAULT],
      ['0', SNAPSHOT_PENDING_AGING_N_DEFAULT],
      ['2', 2],
    ])('aging N %s -> %s', (raw, expected) => {
      expect(resolvePendingAgingN(raw as string | undefined)).toBe(expected);
    });

    it.each([
      [undefined, SNAPSHOT_PENDING_AGING_WINDOW_MS_DEFAULT],
      ['', SNAPSHOT_PENDING_AGING_WINDOW_MS_DEFAULT],
      ['-20', SNAPSHOT_PENDING_AGING_WINDOW_MS_DEFAULT],
      ['120000.5', 120_000],
    ])('aging window %s -> %s', (raw, expected) => {
      expect(resolvePendingAgingWindowMs(raw as string | undefined)).toBe(
        expected,
      );
    });
  });

  describe('audit notes', () => {
    it('swrNowNote names the row age and the fail-open serve', () => {
      const note = swrNowNote(1234);
      expect(note).toContain('1234ms');
      expect(note).toContain('fail-open');
    });

    it('swrNowNote clamps a negative age to 0', () => {
      expect(swrNowNote(-10)).toContain('age 0ms');
    });

    it('agingEscalationNote names the count and the window in seconds', () => {
      const note = agingEscalationNote(3, 600_000);
      expect(note).toContain('pending 3 consecutive times');
      expect(note).toContain('600s');
    });

    it('neither note is a governor quota event — latency never sheds tiers', () => {
      expect(isGovernorQuotaEvent('swr-now', swrNowNote(60_000))).toBe(false);
      expect(isGovernorQuotaEvent('aging', agingEscalationNote(3, 600_000))).toBe(
        false,
      );
      // Sanity: the predicate is live (a real quota string would count).
      expect(isGovernorQuotaEvent('provider', 'rate limit hit')).toBe(true);
    });
  });
});
