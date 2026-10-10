# DeFiLlama Coins provider (dexter plan todo 32)

Keyless price leg over `coins.llama.fi` (NOT `api.llama.fi` — TVL host).

- `GET /prices/current/{chain}:{address}` → price + decimals + symbol +
  timestamp + confidence (NO mcap/fdv/liquidity — the fetcher maps
  `priceUsd` + mint-bound `symbol` only).
- `GET /chart/{chain}:{address}[?start=]` → coarse series; `getChartMax`
  is client-side max, deliberately WEAKER than an ATH (probed 1 point
  over 90d for WETH) — the snapshot fetcher never calls it (ATH stays
  own-history per the ATH-history rule).

Coverage (probed keyless 2026-10-09, evidence
`.omo/evidence/task-fe-newprov.log`): ethereum/solana/bsc/base/
arbitrum/polygon/optimism/unichain INCLUDE (`robinhood` EXCLUDED —
no entry for 2 addresses). Per-token variance is real (ARB/POL/WMATIC
miss while chain siblings hit) → fallback-only leg, last position.
`optimism`/`unichain` mapped-but-unqueried until the chain catalog
lands (birdeye/gecko precedent).

No key, no published hard quota — outbound bucket `60/min` by repo
convention. `rateLimitPerMin: 60` (`../../domain/provider-descriptor.ts`).

Docs: https://defillama.com/docs/api
