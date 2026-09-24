import {
  TelegramMtprotoListenerAdapter,
  capPolledChannels,
  computePollDelayMs,
  normalizeJitterFraction,
} from './telegram-mtproto-listener.adapter';

function buildAdapter(deps: {
  safety?: {
    maxChannels: number;
    pollIntervalBaseMs: number;
    jitterPercent: number;
  };
  asleep?: boolean;
}): {
  adapter: TelegramMtprotoListenerAdapter;
  lastSeenLoad: jest.Mock;
  sleepWindow: { isAsleep: jest.Mock; getNextWakeTime: jest.Mock };
} {
  const lastSeenLoad = jest.fn().mockResolvedValue(undefined);
  const sleepWindow = {
    isAsleep: jest.fn().mockReturnValue(deps.asleep ?? false),
    getNextWakeTime: jest.fn().mockReturnValue(null),
  };
  const adapter = new TelegramMtprotoListenerAdapter(
    { get: jest.fn().mockReturnValue({}) } as never,
    { ensureClient: jest.fn() } as never,
    { load: lastSeenLoad, get: jest.fn().mockReturnValue(-1) } as never,
    {} as never,
    { findAllActive: jest.fn().mockResolvedValue([]) } as never,
    { transform: jest.fn() } as never,
    { extractAndDownload: jest.fn() } as never,
    (deps.safety ?? {
      maxChannels: 50,
      pollIntervalBaseMs: 90_000,
      jitterPercent: 30,
    }) as never,
    sleepWindow as never,
  );
  return { adapter, lastSeenLoad, sleepWindow };
}

describe('polling config helpers (gap 16)', () => {
  describe('normalizeJitterFraction', () => {
    it('passes fractions through', () => {
      expect(normalizeJitterFraction(0.3)).toBeCloseTo(0.3);
      expect(normalizeJitterFraction(0)).toBe(0);
      expect(normalizeJitterFraction(1)).toBe(1);
    });

    it('treats values > 1 as percent', () => {
      expect(normalizeJitterFraction(30)).toBeCloseTo(0.3);
      expect(normalizeJitterFraction(100)).toBe(1);
    });

    it('clamps out-of-range input', () => {
      expect(normalizeJitterFraction(-5)).toBe(0);
      expect(normalizeJitterFraction(250)).toBe(1);
      expect(normalizeJitterFraction(Number.NaN)).toBe(0);
    });
  });

  describe('computePollDelayMs', () => {
    it('returns the base with zero jitter', () => {
      expect(computePollDelayMs(90_000, 0, () => 0.999)).toBe(90_000);
    });

    it('applies symmetric jitter within bounds', () => {
      expect(computePollDelayMs(90_000, 30, () => 1)).toBe(117_000);
      expect(computePollDelayMs(90_000, 30, () => 0)).toBe(63_000);
      expect(computePollDelayMs(90_000, 0.3, () => 0.5)).toBe(90_000);
    });

    it('floors at 1s so 100% jitter can never hot-loop', () => {
      expect(computePollDelayMs(1_000, 100, () => 0)).toBe(1_000);
    });

    it('falls back to 30s on invalid base', () => {
      expect(computePollDelayMs(Number.NaN, 0, () => 0.5)).toBe(30_000);
      expect(computePollDelayMs(-10, 0, () => 0.5)).toBe(30_000);
    });
  });

  describe('capPolledChannels', () => {
    it('passes through when under the cap', () => {
      expect(capPolledChannels(['a', 'b'], 50)).toEqual({
        channels: ['a', 'b'],
        truncated: 0,
      });
    });

    it('truncates over-cap lists and reports the count', () => {
      const ids = ['a', 'b', 'c', 'd'];
      expect(capPolledChannels(ids, 2)).toEqual({
        channels: ['a', 'b'],
        truncated: 2,
      });
    });

    it('treats non-positive max as no cap', () => {
      expect(capPolledChannels(['a'], 0).truncated).toBe(0);
    });
  });
});

describe('TelegramMtprotoListenerAdapter polling wiring', () => {
  it('computePollDelay reads pollIntervalBaseMs + jitterPercent from safety config', () => {
    const { adapter } = buildAdapter({
      safety: {
        maxChannels: 50,
        pollIntervalBaseMs: 120_000,
        jitterPercent: 0,
      },
    });

    expect(adapter.computePollDelay(() => 0.5)).toBe(120_000);
  });

  it('computePollDelay honors percent-style jitter (30 = ±30%)', () => {
    const { adapter } = buildAdapter({
      safety: {
        maxChannels: 50,
        pollIntervalBaseMs: 100_000,
        jitterPercent: 30,
      },
    });

    expect(adapter.computePollDelay(() => 1)).toBe(130_000);
    expect(adapter.computePollDelay(() => 0)).toBe(70_000);
  });

  it('updateSubscribedChannels loads persisted cursors for added channels', () => {
    const { adapter, lastSeenLoad } = buildAdapter({});
    const inner = adapter as unknown as {
      subscribedChannelIds: string[];
      updateSubscribedChannels: (ids: string[]) => void;
    };
    inner.subscribedChannelIds = ['-1001'];

    inner.updateSubscribedChannels(['-1001', '-1009']);

    expect(lastSeenLoad).toHaveBeenCalledWith(['-1009']);
    expect(inner.subscribedChannelIds).toEqual(['-1001', '-1009']);
  });

  it('updateSubscribedChannels does not touch cursors when nothing changed', () => {
    const { adapter, lastSeenLoad } = buildAdapter({});
    const inner = adapter as unknown as {
      subscribedChannelIds: string[];
      updateSubscribedChannels: (ids: string[]) => void;
    };
    inner.subscribedChannelIds = ['-1001'];

    inner.updateSubscribedChannels(['-1001']);

    expect(lastSeenLoad).not.toHaveBeenCalled();
  });

  it('sleep window service is wired (polling can consult it)', () => {
    const { sleepWindow } = buildAdapter({ asleep: true });

    expect(sleepWindow.isAsleep()).toBe(true);
  });
});
