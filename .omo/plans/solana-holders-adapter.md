# Plan: Solana Token Holders via getTokenLargestAccounts

## TL;DR

> Implement new `SolanaRpcAdapter` to fetch token holders for SPL tokens on Solana using `getTokenLargestAccounts` RPC method. Integrates with existing enrichment pipeline, providing holder count and top 10 holder percentage.

> **Deliverables**:
> - New `SolanaRpcAdapter` in `apps/backend/src/chain/explorer/infrastructure/providers/solana-rpc.adapter.ts`
> - Integration with enrichment pipeline (first-non-null merge)
> - TypeScript type updates
> - Unit tests

> **Estimated Effort**: Short (2-3 hours)
> **Parallel Execution**: NO - sequential (depends on existing types)
> **Critical Path**: Types → Adapter → Integration → Tests

---

## Context

### Original Request
User wants to display holders data for Solana SPL tokens (especially PumpFun tokens like `Ckit5s1Cpc3RdMh1HrhfW2nAy4PnkkgjXgXMeykbpump`). Currently, no provider returns holders for this token.

### Interview Summary
**Key Discussions**:
- Existing providers (DexScreener, GeckoTerminal, Birdeye, Helius DAS) don't have holders data for this token
- Solana RPC method `getTokenLargestAccounts` provides top 20 holders
- Helius RPC is already configured in the project

**Research Findings**:
- `getTokenLargestAccounts` returns top 20 holders with balances
- Helius RPC can be reused (already has API key configured)
- Free public RPC available as fallback (`https://api.mainnet.solana.com`)

---

## Work Objectives

### Core Objective
Add holders data retrieval for Solana SPL tokens via Solana RPC `getTokenLargestAccounts` method.

### Concrete Deliverables
- New `SolanaRpcAdapter` extending `MarketDataProviderPort`
- Adapter fetches top 20 holders, calculates `top10HolderPercent`
- Integrates with existing enrichment pipeline via first-non-null merge

### Definition of Done
- [ ] New adapter returns `MarketData` with holders and top10HolderPercent
- [ ] Enrichment pipeline merges holder data from new adapter
- [ ] API call to `POST /token/market-data/enrich` returns holders for SPL tokens
- [ ] Frontend displays holders count when available

### Must Have
- Holders count from top 20 accounts (or total if DAS available)
- Top 10 holder percentage calculation

### Must NOT Have (Guardrails)
- Don't modify existing provider adapters
- Don't change frontend (already displays holders when available)
- Don't implement getProgramAccounts (too expensive, not needed)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (Jest in backend)
- **Automated tests**: YES (tests-after)
- **Framework**: Jest (already configured)

---

## Execution Strategy

### Sequential Execution (Small task)

```
Task 1: Create SolanaRpcAdapter (foundation)
Task 2: Add to module providers (integration)
Task 3: Add unit tests (verification)
Task 4: Manual API test (final verification)
```

---

## TODOs

- [ ] 1. Create SolanaRpcAdapter

  **What to do**:
  - Create new file: `apps/backend/src/chain/explorer/infrastructure/providers/solana-rpc.adapter.ts`
  - Extend `MarketDataProviderPort` abstract class
  - Implement `fetch(chain, address)` using `getTokenLargestAccounts` RPC
  - Use Helius RPC URL from config (already available)
  - Return: `holders` (estimated from top 20), `top10HolderPercent` (calculated)

  **Must NOT do**:
  - Don't modify other provider adapters
  - Don't implement getProgramAccounts (expensive)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward adapter implementation, follows existing patterns
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - N/A - simple adapter

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `apps/backend/src/chain/explorer/infrastructure/providers/helius.adapter.ts` - Similar pattern for Helius RPC
  - `apps/backend/src/chain/explorer/infrastructure/providers/dexscreener.adapter.ts` - MarketDataProviderPort pattern
  - `apps/backend/src/chain/explorer/domain/ports/market-data-provider.port.ts` - Interface to implement

  **Acceptance Criteria**:
  - [ ] File created at correct path
  - [ ] Extends MarketDataProviderPort
  - [ ] Implements fetch method returning MarketData
  - [ ] Uses Helius RPC from config
  - [ ] tsconfig compiles without errors

  **QA Scenarios**:

  Scenario: Adapter returns holders data for SPL token
    Tool: Bash (curl)
    Preconditions: Helius API key configured
    Steps:
      1. Call enrichment API with force=true for SPL token
      2. Verify response includes holders and top10HolderPercent
    Expected Result: holders > 0, top10HolderPercent between 0-100
    Evidence: JSON response from API

  Scenario: Adapter returns null for non-Solana chain
    Tool: Bash (curl)
    Preconditions: N/A
    Steps:
      1. Call enrichment API with chain=evm
      2. Verify response doesn't include data from SolanaRpcAdapter
    Expected Result: Adapter returns null, other providers used
    Evidence: JSON response

- [ ] 2. Register adapter in enrichment module

  **What to do**:
  - Add `SolanaRpcAdapter` to providers array in `enrichment.module.ts`
  - Ensure it's injected via `PROVIDERS` Symbol

  **Must NOT do**:
  - Don't remove existing providers

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `apps/backend/src/token/market-data/enrichment.module.ts` - Module wiring

  **Acceptance Criteria**:
  - [ ] Adapter imported in module
  - [ ] Adapter added to PROVIDERS factory

- [ ] 3. Add unit tests

  **What to do**:
  - Create test file: `apps/backend/src/chain/explorer/infrastructure/providers/solana-rpc.adapter.spec.ts`
  - Test: returns null for non-solana chain
  - Test: returns MarketData with holders for valid token
  - Test: calculates top10HolderPercent correctly

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `apps/backend/src/chain/explorer/infrastructure/providers/helius.adapter.spec.ts` - Test patterns

  **Acceptance Criteria**:
  - [ ] Test file created
  - [ ] All tests pass

- [ ] 4. Manual API verification

  **What to do**:
  - Run enrichment API for the PumpFun token
  - Verify holders data is returned

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None
  - **Blocked By**: Task 3

  **Acceptance Criteria**:
  - [ ] API returns holders for Ckit5s1Cpc3RdMh1HrhfW2nAy4PnkkgjXgXMeykbpump
  - [ ] top10HolderPercent is calculated

---

## Commit Strategy

- **1**: `feat(chain): add SolanaRpcAdapter for token holders` - solana-rpc.adapter.ts, enrichment.module.ts

- **2**: `test(chain): add SolanaRpcAdapter tests` - solana-rpc.adapter.spec.ts

---

## Success Criteria

### Verification Commands
```bash
# Build
npm run build -w @alpha-meta-token-scanner/backend

# Test
npm run test:backend -- --testPathPattern=solana-rpc

# API test
curl -X POST "http://localhost:3030/token/market-data/enrich" \
  -H "Content-Type: application/json" \
  -d '{"chain":"solana","address":"Ckit5s1Cpc3RdMh1HrhfW2nAy4PnkkgjXgXMeykbpump","force":true}'
```

### Final Checklist
- [ ] Adapter created at correct path
- [ ] Extends MarketDataProviderPort correctly
- [ ] Returns holders and top10HolderPercent
- [ ] Build passes
- [ ] Tests pass
- [ ] API returns holders for SPL token