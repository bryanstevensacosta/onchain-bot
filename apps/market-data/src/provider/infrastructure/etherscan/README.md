# Etherscan V2 provider (dexter plan todo 32)

Keyed enrichment legs over `https://api.etherscan.io/v2/api`
(one key for 60+ chains via `chainid`).

- supply: `module=token&action=tokensupply` → RAW base units
  (unit-unsafe: never mapped to `totalSupply`; future
  decimals-aware consumers only).
- holders: `module=token&action=tokenholdercount` → exact count
  (PRO-gated = Standard+; free-key nulls are expected).
- verified: `module=contract&action=getsourcecode` → free on ALL
  chains (no `SnapshotQuote` column → unwired, documented).

KEY OBLIGATORY (`ETHERSCAN_API_KEY` at https://etherscan.io/apis).
Absent = skip-if-absent, zero network (DEFAULT state). 4663 gate:
UNVERIFIED without a key → `wontfix-documentado` (free
Robinhood/Arc window EXPIRES 2026-10-15, then Lite $49+ —
https://docs.etherscan.io/supported-chains).

Quota: free 3 calls/s, 100k/day
(https://docs.etherscan.io/rate-limits); outbound bucket `60/min`
(1 call/snapshot worst case). `rateLimitPerMin: 60`
(`../../domain/provider-descriptor.ts`).

Actions: https://docs.etherscan.io/endpoint-overview
