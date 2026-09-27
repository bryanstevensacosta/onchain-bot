/**
 * Provider outbound budgets (Tramo 3, todo 14, anti-ban).
 *
 * Centralized per-provider outbound limits for the snapshot fan-out.
 * Budgets resolve from the provider registry descriptors (the single
 * source of truth — `ProviderDescriptor.rateLimitPerMin`, whose values
 * mirror the free-tier column of
 * `.omo/evidence/providers-reference.md`: dexscreener 60/min,
 * geckoterminal 60/min, birdeye 60/min (1 rps), moralis 60/min,
 * rugcheck 60/min). Unknown names get the conservative default —
 * never unlimited. Bucket keys live under `outbound:`, disjoint from
 * the edge `gw:` namespace.
 */
export const PROVIDER_OUTBOUND_WINDOW_MS = 60_000;

export const PROVIDER_OUTBOUND_DEFAULT_PER_MIN = 60;

export interface ProviderOutboundBudget {
  readonly limit: number;
  readonly windowMs: number;
}

export interface ProviderBudgetDescriptor {
  readonly name: string;
  readonly rateLimitPerMin: number;
}

export function buildOutboundKey(name: string): string {
  return `outbound:${name}`;
}

export function resolveProviderOutboundBudget(
  descriptors: ReadonlyArray<ProviderBudgetDescriptor>,
  name: string,
): ProviderOutboundBudget {
  const found = descriptors.find((descriptor) => descriptor.name === name);
  return {
    limit: found?.rateLimitPerMin ?? PROVIDER_OUTBOUND_DEFAULT_PER_MIN,
    windowMs: PROVIDER_OUTBOUND_WINDOW_MS,
  };
}
