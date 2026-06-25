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

- Public-RPC fallback if Helius is down (single point of failure — acceptable for v1, see R5 below)

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