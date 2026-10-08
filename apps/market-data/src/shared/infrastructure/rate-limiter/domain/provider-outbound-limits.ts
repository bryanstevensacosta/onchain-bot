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

/**
 * Snapshot-tail shared budget (dexter plan todo 29 — the math the tail
 * must respect; the tail extras run OUTSIDE the `outbound:` buckets
 * below, so this comment IS the accounting).
 *
 * Worst case per COLD snapshot (cache HITs never reach the tail):
 * - launchpad: Solana = 1x `getMultipleAccounts` (PDA candidates
 *   batched); EVM = cheap view/API legs + 1 blockscout lookup + 1
 *   receipt fetch = <= 4 calls.
 * - venue: 1x DexScreener HTTP + 1x GeckoTerminal HTTP only when
 *   DexScreener misses = <= 2 calls.
 * - dev holdings: 2x Birdeye (parallel) + 1x Helius first-tx = <= 3
 *   calls, solana-only (other chains skip).
 * Total <= ~10 outbound calls per cold snapshot, spread over tiers
 * (Helius ~10 rps, public RPC 40/10s per IP, DexScreener/GeckoTerminal
 * 60/min each, Birdeye keyed). At snapshot rate Q/s the tail adds at
 * most ~10Q calls/s spread — and each extra is abandoned after 400ms
 * (never retried, never re-queued), so bursts cannot stack past one
 * 400ms window per snapshot. If snapshot QPS ever grows 10x, the
 * 400ms budget (not the tiers) is the first knob to tighten.
 */

export interface ProviderOutboundBudget {
  readonly limit: number;
  readonly windowMs: number;
  /** Bucket tokens burned per call for the resolved endpoint (default 1). */
  readonly cost?: number;
}

export interface ProviderBudgetDescriptor {
  readonly name: string;
  readonly rateLimitPerMin: number;
  readonly endpointCosts?: Readonly<Record<string, number>>;
}

export function buildOutboundKey(name: string): string {
  return `outbound:${name}`;
}

export function resolveProviderOutboundBudget(
  descriptors: ReadonlyArray<ProviderBudgetDescriptor>,
  name: string,
  endpoint = 'quote',
): ProviderOutboundBudget {
  const found = descriptors.find((descriptor) => descriptor.name === name);
  const rawCost = found?.endpointCosts?.[endpoint];
  return {
    limit: found?.rateLimitPerMin ?? PROVIDER_OUTBOUND_DEFAULT_PER_MIN,
    windowMs: PROVIDER_OUTBOUND_WINDOW_MS,
    cost: typeof rawCost === 'number' && rawCost >= 1 ? Math.floor(rawCost) : 1,
  };
}
