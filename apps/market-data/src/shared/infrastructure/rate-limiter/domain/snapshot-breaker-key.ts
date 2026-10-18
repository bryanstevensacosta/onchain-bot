/**
 * Breaker key namespace for snapshot quote fetchers (dexter plan todo
 * 29 gate + todo 19b3 single-path relay).
 *
 * ONE definition shared by BOTH ends of the breaker path:
 * - `ProviderRegistryService.recordFailure` relays a transport
 *   failure into this key (the registry is the only failure writer;
 *   it cannot import the snapshot service — that would be a cycle);
 * - `AddressSnapshotService.applyBreakerGate` reads `canExecute` on
 *   the same key before admitting a fetcher (half-open admits ONE
 *   probe — the first cheapest fetcher in policy order).
 *
 * The namespace stays disjoint from the `outbound:` token buckets.
 * Memory store + reset-on-deploy ACCEPTED (todo 19b3): a deploy wipes
 * the failure counts — flapping providers get a clean slate per
 * deploy (documented, not hidden).
 */
export const snapshotBreakerKey = (name: string): string =>
  `snapshot-fetcher:${name}`;
