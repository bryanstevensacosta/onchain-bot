# Draft: Solana Token Holders Adapter Implementation

> **Status: done** — adapter was already implemented in a prior session. Draft retained for traceability.

## Evidence

| Component | Path |
|---|---|
| Adapter impl | `apps/backend/src/chain/explorer/infrastructure/providers/solana-rpc.adapter.ts` (134 lines) |
| Spec | `apps/backend/src/chain/explorer/infrastructure/providers/solana-rpc.adapter.spec.ts` (8 tests, 178 lines) |
| Module wiring | `apps/backend/src/chain/explorer/chain-explorer.module.ts:51,60,67,75` (registered in `MARKET_DATA_PROVIDERS`) |
| Real holder count | `apps/backend/src/chain/explorer/infrastructure/providers/helius.adapter.ts` (DAS `getTokenAccounts`, paginates 1000/mint) |

`HeliusAdapter` runs BEFORE `SolanaRpcAdapter` in `MARKET_DATA_PROVIDERS`, so the first-non-null merge in `EnrichTokenUseCase` picks the real holder count when available and falls back to top-20 count from `SolanaRpcAdapter` otherwise. `top10HolderPercent` is uniquely populated by `SolanaRpcAdapter`.

## Not implemented (out of scope, see draft)

- DAS exact holder count beyond top-1000 (HeliusAdapter handles this; not SolanaRpcAdapter's concern)

## Public-RPC fallback (R5 of draft) — implemented

`SolanaRpcAdapter` falls back to `https://api.mainnet.solana.com` on transport-level errors (500, ECONNREFUSED, timeout) — 404 and protocol errors (`data.error`) short-circuit to null. Extracted `private callRpc(rpcUrl, address)` + `private mapAccounts(accounts)` from the previous inline implementation.

Coverage: 12 specs (was 9). Added: "falls back to public RPC when primary transport fails", "returns holders from public RPC when Helius is missing", "throws when both primary and public RPC fail", "returns null when primary transport fails and public RPC returns 404". Strengthened existing tests with `toHaveBeenCalledTimes(1)` to verify no fallback on protocol-level "no data" signals.

## Requirements (confirmed)
- Get holders data for SPL tokens on Solana (especially PumpFun tokens)
- Show top 20 holders and calculate holder count + top10HolderPercent
- Integrate with existing enrichment pipeline (first-non-null merge)

## Technical Decisions
- **API Method**: `getTokenLargestAccounts` - Returns top 20 holders
- **Provider**: Use existing Helius RPC (already configured in .env)
- **Implementation**: New adapter `SolanaRpcAdapter` extending `MarketDataProviderPort`
- **Fallback**: Public Solana RPC if Helius fails

## Research Findings

### API Details
- **Method**: `getTokenLargestAccounts`
- **Cost**: ~20 compute units per request
- **Returns**: Array of up to 20 largest token accounts with balances
- **Response fields**: address, amount, decimals, uiAmount, uiAmountString

### Available RPCs
- Helius: `https://mainnet.helius-rpc.com/?api-key=KEY` (already configured)
- Public: `https://api.mainnet.solana.com` (rate limited)
- dRPC: `https://solana.drpc.org` (free tier)

### Calculation Logic
- `holders`: Total count from `getTokenAccounts` (DAS) OR estimate from `getTokenLargestAccounts`
- `top10HolderPercent`: Sum top 10 amounts / total supply * 100

## Open Questions
- Should we use Helius DAS for exact count + RPC for distribution?
- Cache strategy for holders data?

## Scope Boundaries
- IN: New adapter, integration with enrichment, TypeScript updates
- EX: Frontend UI changes (already shows holders when available)