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
 *   batched); EVM = cheap view/API legs + 1 Alchemy
 *   `getAssetTransfers` creation lookup + 1 receipt fetch = <= 4
 *   calls.
 * - venue: 1x DexScreener HTTP + 1x GeckoTerminal HTTP only when
 *   DexScreener misses = <= 2 calls.
 * - dev holdings: 2x Birdeye (parallel) + 1x Helius first-tx = <= 3
 *   calls, solana-only (other chains skip).
 * - derivation (todo 33/46/55, only when every native 24h change is
 *   null): 1x Gecko pools (+1 search on miss) + 1x OHLC, or the keyed
 *   Birdeye token-level route = <= 3 calls.
 * - ATH seed (todo 68, marker-absent tokens): 1x Gecko `ohlcv/day`,
 *   keyless, ONCE per token ever (marker) — see the quota note below
 *   (real GT throttle ~10-30/min, not the 60/min our bucket mirrors).
 * Total <= ~10-11 outbound calls per cold snapshot, spread over tiers
 * (Helius ~10 rps, public RPC 40/10s per IP, DexScreener/GeckoTerminal
 * 60/min each, Birdeye keyed). Two of those Gecko calls (derivation
 * OHLC, ATH seed) answer `< 2s` budgets of their own and the seed is
 * per-token one-shot, so steady-state per-request cost stays at the
 * pre-68 level after the first touch. At snapshot rate Q/s the tail
 * adds at most ~11Q calls/s spread — and each extra is abandoned after
 * its budget (never retried, never re-queued), so bursts cannot stack
 * past one budget window per snapshot. If snapshot QPS ever grows 10x,
 * the 400ms tail budget (not the tiers) is the first knob to tighten.
 *
 * INTERNAL-vs-REAL THROTTLE WARNING: the registry `60/min` mirrors a
 * soft internal ceiling; measured live GeckoTerminal tolerance is
 * ~10/min bursts (12-30/min over a minute, headerless-429 wall under
 * parallel load — `.omo/evidence/task-fe-ath-backfill-ext.log`). The
 * todo-68 ATH seed adds ONE such call per marker-less token, AFTER
 * the tail and UNMETERED by `outbound:geckoterminal` (same placement
 * as the derivation OHLC calls — the fan-out bucket gates fetchers,
 * not these post-serve legs): its real limits are the 2s own budget,
 * the once-per-token marker and the 6h negative memo — never raise
 * the bucket to absorb it; expect GT 429s at burst and let the
 * fail-open/memo path handle them.
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
