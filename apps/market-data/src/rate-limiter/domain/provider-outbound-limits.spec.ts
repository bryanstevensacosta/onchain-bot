import {
  PROVIDER_OUTBOUND_DEFAULT_PER_MIN,
  PROVIDER_OUTBOUND_WINDOW_MS,
  buildOutboundKey,
  resolveProviderOutboundBudget,
} from './provider-outbound-limits';

/**
 * Failing-first spec (Tramo 3, todo 14, anti-ban).
 *
 * Centralized outbound budgets resolve from the provider registry
 * descriptors (single source of truth, values mirror
 * `.omo/evidence/providers-reference.md`); unknown names fall back to
 * the conservative default — never unlimited.
 */
describe('resolveProviderOutboundBudget (centralized outbound limits)', () => {
  const descriptors = [
    { name: 'dexscreener', rateLimitPerMin: 60 },
    { name: 'geckoterminal', rateLimitPerMin: 60 },
    { name: 'birdeye', rateLimitPerMin: 60 },
    { name: 'moralis', rateLimitPerMin: 60 },
    { name: 'rugcheck', rateLimitPerMin: 60 },
  ];

  it('resolves the registry budget per provider on a 60s window', () => {
    expect(PROVIDER_OUTBOUND_WINDOW_MS).toBe(60_000);
    for (const descriptor of descriptors) {
      const budget = resolveProviderOutboundBudget(
        descriptors,
        descriptor.name,
      );
      expect(budget).toEqual({
        limit: descriptor.rateLimitPerMin,
        windowMs: 60_000,
      });
    }
  });

  it('pins dexscreener at 60/min (task shorthand + conservative leg)', () => {
    expect(
      resolveProviderOutboundBudget(descriptors, 'dexscreener').limit,
    ).toBe(60);
  });

  it('falls back to the conservative default for unknown providers', () => {
    expect(PROVIDER_OUTBOUND_DEFAULT_PER_MIN).toBe(60);
    expect(resolveProviderOutboundBudget(descriptors, 'nope')).toEqual({
      limit: 60,
      windowMs: 60_000,
    });
  });

  it('builds outbound bucket keys disjoint from the edge gw: namespace', () => {
    expect(buildOutboundKey('dexscreener')).toBe('outbound:dexscreener');
    expect(buildOutboundKey('dexscreener').startsWith('gw:')).toBe(false);
  });
});
