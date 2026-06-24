# Draft: Solana Token Holders Adapter Implementation

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