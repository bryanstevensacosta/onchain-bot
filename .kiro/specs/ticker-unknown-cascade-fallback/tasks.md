# Implementation Plan

## Overview

This implementation plan follows the bugfix workflow for the ticker-unknown-cascade-fallback fix. The plan includes:
1. Exploratory bug condition test (Property 1) that fails on unfixed code
2. Preservation property tests (Property 2) that pass on unfixed code
3. Implementation of TickerResolverService with cascading fallback system
4. Integration with TokenApprovedPublishHandler
5. Module registration in VipCallsModule
6. Comprehensive unit and integration tests

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Null Ticker After DB Lookups
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (39% of VIP calls show "UNKNOWN")
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test implementation: Create integration test that simulates TokenApprovedPublishHandler processing events where `token?.ticker = null AND snapshot?.symbol = null`
  - The test assertions should match the Expected Behavior Properties from design:
    - Assert that the handler SHOULD call TickerResolverService when ticker is null
    - Assert that the resolved ticker SHOULD be non-null (either from provider or "ANON")
  - Run test on UNFIXED code (before implementing TickerResolverService)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found:
    - Handler returns ticker = null when DB lookups fail
    - Handler does not query external providers (DexScreener, GeckoTerminal, etc.)
    - Handler does not extract ticker from name
    - VipMessageFormatterAdapter displays "UNKNOWN"
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [~] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Ticker Resolution Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Run handler with token.ticker = "BTC", observe it returns "BTC" without querying providers
    - Run handler with token.ticker = null, snapshot.symbol = "ETH", observe it returns "ETH"
    - Verify heuristic parser extracts tickers from messages (e.g., "$PEPE" → "PEPE")
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements:
    - Property: For all events where token.ticker is not null, handler returns token.ticker
    - Property: For all events where token.ticker is null and snapshot.symbol is not null, handler returns snapshot.symbol
    - Property: Handler never queries TickerResolverService when ticker is resolved by existing sources
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. Implement TickerResolverService and integrate with TokenApprovedPublishHandler

  - [~] 3.1 Create TickerResolverService with cascading fallback system
    - Create new file: `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/vip-calls-channel/application/services/ticker-resolver.service.ts`
    - Implement 9-level cascading fallback:
      1. DexScreener: `getPairsByToken(address)` → `pairs[0].baseToken.symbol`
      2. GeckoTerminal: `getTokenInfo(networkSlug, address)` → `symbol`
      3. CoinGecko: `getTokenContractInfo(platform, address)` → symbol from response
      4. Moralis (EVM only): `getTokenMetadata(address, chain)` → `symbol`
      5. Helius (Solana only): `getAsset(address)` → `content.metadata.symbol`
      6. Name extraction: `extractTickerFromName(name)` → first word, uppercase, 2-10 chars
      7. Return null (caller uses "ANON")
    - Add structured logging at each step: `[TickerResolver] Attempting {provider} for {chain}:{address}`, `[TickerResolver] {provider} returned: {ticker}`
    - Implement chain mapping logic (GeckoTerminal slugs, CoinGecko platforms, Moralis slugs)
    - Implement error handling (catch, log, continue to next provider)
    - _Bug_Condition: isBugCondition(input) where ticker is null after DB lookups (token?.ticker = null AND snapshot?.symbol = null)_
    - _Expected_Behavior: resolveTicker() returns non-null ticker from cascading fallback or null (caller uses "ANON")_
    - _Preservation: Existing ticker resolution (heuristic parser, DB lookups) unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [~] 3.2 Integrate TickerResolverService into TokenApprovedPublishHandler
    - Modify `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/token-approved-publish.handler.ts`
    - Add constructor injection: `private readonly tickerResolver: TickerResolverService`
    - Update ticker resolution logic:
      ```typescript
      let ticker = token?.ticker ?? snapshot?.symbol ?? null;
      if (ticker === null) {
        this.logger.debug(`Ticker null after DB lookups, attempting cascading fallback for ${event.payload.chain}:${event.payload.address}`);
        ticker = await this.tickerResolver.resolveTicker({
          chain: event.payload.chain,
          address: event.payload.address,
          name: snapshot?.name ?? token?.name ?? null,
        }) ?? 'ANON';
        this.logger.debug(`Cascading fallback resolved ticker: ${ticker}`);
      }
      ```
    - Preserve existing event flow (no changes to event handling, publishing structure, error handling)
    - _Bug_Condition: isBugCondition(input) where ticker is null after DB lookups_
    - _Expected_Behavior: Handler calls TickerResolverService when ticker is null, returns non-null ticker_
    - _Preservation: Existing ticker resolution (token.ticker, snapshot.symbol) takes precedence, event flow unchanged_
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [~] 3.3 Register TickerResolverService in VipCallsModule
    - Modify `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts`
    - Import DataProviderModule (provides DexScreenerService, GeckoTerminalService, CoinGeckoService, MoralisService, HeliusService)
    - Add TickerResolverService to providers array
    - No export needed (service is internal to VipCallsModule)
    - _Preservation: Module structure unchanged, only adds new service_
    - _Requirements: 3.6_

  - [~] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Cascading Fallback Resolves Ticker
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify handler calls TickerResolverService when ticker is null
    - Verify resolved ticker is non-null (either from provider or "ANON")
    - Verify VipMessageFormatterAdapter displays resolved ticker instead of "UNKNOWN"
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [~] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Ticker Resolution Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Verify handler returns token.ticker when not null (no provider queries)
    - Verify handler returns snapshot.symbol when token.ticker is null and snapshot.symbol is not null (no provider queries)
    - Verify heuristic parser continues to extract tickers from messages
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 4. Write comprehensive unit tests for TickerResolverService

  - [~] 4.1 Test DexScreener success case
    - Mock DexScreenerService.getPairsByToken() to return `pairs[0].baseToken.symbol = "PEPE"`
    - Call resolveTicker({ chain: "solana", address: "0x123", name: null })
    - Assert result = "PEPE"
    - Assert only DexScreener was queried (other providers not called)
    - _Requirements: 2.4_

  - [~] 4.2 Test GeckoTerminal fallback
    - Mock DexScreener to return null
    - Mock GeckoTerminalService.getTokenInfo() to return `symbol = "DOGE"`
    - Call resolveTicker({ chain: "ethereum", address: "0x456", name: null })
    - Assert result = "DOGE"
    - Assert DexScreener and GeckoTerminal were queried (others not called)
    - _Requirements: 2.4_

  - [~] 4.3 Test CoinGecko fallback
    - Mock DexScreener and GeckoTerminal to return null
    - Mock CoinGeckoService.getTokenContractInfo() to return symbol = "SHIB"
    - Call resolveTicker({ chain: "bsc", address: "0x789", name: null })
    - Assert result = "SHIB"
    - Assert DexScreener, GeckoTerminal, CoinGecko were queried
    - _Requirements: 2.4_

  - [~] 4.4 Test Moralis fallback (EVM chains)
    - Mock DexScreener, GeckoTerminal, CoinGecko to return null
    - Mock MoralisService.getTokenMetadata() to return `symbol = "FLOKI"`
    - Call resolveTicker({ chain: "ethereum", address: "0xabc", name: null })
    - Assert result = "FLOKI"
    - Verify Moralis is only queried for EVM chains (ethereum, bsc, base, arbitrum, polygon)
    - _Requirements: 2.4_

  - [~] 4.5 Test Helius fallback (Solana only)
    - Mock DexScreener, GeckoTerminal, CoinGecko to return null
    - Mock HeliusService.getAsset() to return `content.metadata.symbol = "BONK"`
    - Call resolveTicker({ chain: "solana", address: "0xdef", name: null })
    - Assert result = "BONK"
    - Verify Helius is only queried for Solana chain
    - Verify Moralis is skipped for Solana
    - _Requirements: 2.4_

  - [~] 4.6 Test name extraction fallback
    - Mock all external providers to return null
    - Call resolveTicker({ chain: "solana", address: "0xghi", name: "Pepe Coin" })
    - Assert result = "PEPE"
    - Test edge cases:
      - Multi-word name: "Super Doge Coin" → "SUPER"
      - Name with special chars: "Pepe-Coin!" → "PEPE"
      - Single char name: "X" → null (too short)
      - Very long name: "VeryLongTokenName123" → null (too long, > 10 chars)
      - Null name: null → null
    - _Requirements: 2.3_

  - [~] 4.7 Test final fallback (all sources fail)
    - Mock all external providers to return null
    - Mock name extraction to return null (invalid name)
    - Call resolveTicker({ chain: "solana", address: "0xjkl", name: null })
    - Assert result = null (caller will use "ANON")
    - _Requirements: 2.5_

  - [~] 4.8 Test error handling and graceful degradation
    - Mock DexScreener to throw exception
    - Mock GeckoTerminal to return "DOGE"
    - Call resolveTicker({ chain: "ethereum", address: "0xmno", name: null })
    - Assert result = "DOGE" (continues to next provider after error)
    - Verify structured error log was emitted
    - _Requirements: 2.2_

  - [~] 4.9 Test chain mapping logic
    - Verify GeckoTerminal network slugs: solana → "solana", ethereum → "eth", bsc → "bsc", base → "base"
    - Verify CoinGecko platform IDs: solana → "solana", ethereum → "ethereum", bsc → "binance-smart-chain", base → "base"
    - Verify Moralis chain slugs: ethereum → "eth", bsc → "bsc", base → "base", arbitrum → "arbitrum", polygon → "polygon"
    - Verify Helius is only used for Solana
    - _Requirements: 2.4_

  - [~] 4.10 Test structured logging
    - Mock DexScreener to return "PEPE"
    - Call resolveTicker() and capture logs
    - Assert logs contain: `[TickerResolver] Attempting DexScreener for solana:0x123`
    - Assert logs contain: `[TickerResolver] DexScreener returned: PEPE`
    - Mock all providers to fail and verify failure logs
    - _Requirements: 2.2_

- [ ] 5. Write integration tests for TokenApprovedPublishHandler

  - [~] 5.1 Test handler calls TickerResolverService when ticker is null
    - Create spy/mock for TickerResolverService
    - Create TokenApprovedEvent with token.ticker = null, snapshot.symbol = null
    - Mock TickerResolverService.resolveTicker() to return "RESOLVED"
    - Call handler.handle(event)
    - Assert TickerResolverService.resolveTicker() was called once
    - Assert published message contains "$RESOLVED"
    - _Requirements: 2.1, 2.5_

  - [~] 5.2 Test handler skips TickerResolverService when token.ticker is not null
    - Create spy for TickerResolverService
    - Create TokenApprovedEvent with token.ticker = "BTC"
    - Call handler.handle(event)
    - Assert TickerResolverService.resolveTicker() was NOT called
    - Assert published message contains "$BTC"
    - _Requirements: 3.1, 3.2_

  - [~] 5.3 Test handler skips TickerResolverService when snapshot.symbol is not null
    - Create spy for TickerResolverService
    - Create TokenApprovedEvent with token.ticker = null, snapshot.symbol = "ETH"
    - Call handler.handle(event)
    - Assert TickerResolverService.resolveTicker() was NOT called
    - Assert published message contains "$ETH"
    - _Requirements: 3.3_

  - [~] 5.4 Test handler uses "ANON" when TickerResolverService returns null
    - Mock TickerResolverService.resolveTicker() to return null
    - Create TokenApprovedEvent with token.ticker = null, snapshot.symbol = null
    - Call handler.handle(event)
    - Assert published message contains "$ANON"
    - _Requirements: 2.5_

  - [~] 5.5 Test full event flow with real provider services (optional - use test API keys)
    - Create TokenApprovedEvent with real chain/address that triggers fallback
    - Use real DexScreener, GeckoTerminal, CoinGecko services (or mock endpoints)
    - Verify handler publishes message with resolved ticker
    - This test may be skipped if API keys are not available in CI environment
    - _Requirements: 2.1, 2.4_

  - [~] 5.6 Test structured logging in handler
    - Create TokenApprovedEvent with ticker = null
    - Mock TickerResolverService.resolveTicker() to return "RESOLVED"
    - Call handler.handle(event) and capture logs
    - Assert logs contain: "Ticker null after DB lookups, attempting cascading fallback"
    - Assert logs contain: "Cascading fallback resolved ticker: RESOLVED"
    - _Requirements: 2.2_

- [~] 6. Checkpoint - Ensure all tests pass
  - Run full test suite: `npm test` or `yarn test`
  - Verify all unit tests pass (TickerResolverService, extractTickerFromName, chain mapping)
  - Verify all integration tests pass (TokenApprovedPublishHandler)
  - Verify bug condition exploration test passes (task 1)
  - Verify preservation property tests pass (task 2)
  - Fix any failing tests before marking as complete
  - If questions arise, consult with user


## Task Dependency Graph

```
1 (Bug Condition Test) → 3 (Implementation) → 3.4 (Verify Bug Test Passes)
2 (Preservation Tests) → 3 (Implementation) → 3.5 (Verify Preservation Passes)
3.1 (TickerResolverService) → 3.2 (Handler Integration) → 3.3 (Module Registration)
3.3 (Module Registration) → 3.4 (Verify Bug Test)
3.3 (Module Registration) → 3.5 (Verify Preservation)
3.5 (Verify Preservation) → 4 (Unit Tests)
4 (Unit Tests) → 5 (Integration Tests)
5 (Integration Tests) → 6 (Checkpoint)
```

**Critical Path**: 1 → 2 → 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 4 → 5 → 6

**Parallel Opportunities**:
- Task 1 (Bug Condition Test) and Task 2 (Preservation Tests) can be written in parallel
- Task 4 (Unit Tests) subtasks can be executed in parallel once 3.5 passes
- Task 5 (Integration Tests) subtasks can be executed in parallel once Task 4 completes

```json
{
  "waves": [
    {
      "name": "Exploration",
      "tasks": ["1", "2"]
    },
    {
      "name": "Implementation",
      "tasks": ["3.1", "3.2", "3.3"]
    },
    {
      "name": "Verification",
      "tasks": ["3.4", "3.5"]
    },
    {
      "name": "Unit Testing",
      "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10"]
    },
    {
      "name": "Integration Testing",
      "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"]
    },
    {
      "name": "Checkpoint",
      "tasks": ["6"]
    }
  ]
}
```

## Notes

### Property-Based Testing Format

This implementation plan uses the **Property N: Type** format for property-based tests to enable hover status tracking in the Kiro IDE:

- **Property 1: Bug Condition** - Exploration test that fails on unfixed code
- **Property 2: Preservation** - Tests that pass on unfixed code and verify no regressions
- **Property 1: Expected Behavior** - Re-run of bug condition test after fix (should pass)
- **Property 2: Preservation** - Re-run of preservation tests after fix (should still pass)

### Testing Strategy

**Exploratory Phase (Tasks 1-2)**:
- Task 1 writes a test that MUST FAIL on unfixed code (confirms bug exists)
- Task 2 writes tests that MUST PASS on unfixed code (captures baseline behavior)
- Both are written BEFORE implementing the fix

**Implementation Phase (Task 3)**:
- Task 3.1 creates TickerResolverService with 9-level cascading fallback
- Task 3.2 integrates service into TokenApprovedPublishHandler
- Task 3.3 registers service in VipCallsModule
- Task 3.4 re-runs Task 1 test (should now PASS - confirms fix works)
- Task 3.5 re-runs Task 2 tests (should still PASS - confirms no regressions)

**Validation Phase (Tasks 4-6)**:
- Task 4 adds comprehensive unit tests for TickerResolverService
- Task 5 adds integration tests for TokenApprovedPublishHandler
- Task 6 runs full test suite to ensure all tests pass

### Chain Mapping Reference

**GeckoTerminal Network Slugs**:
- solana → "solana"
- ethereum → "eth"
- bsc → "bsc"
- base → "base"
- arbitrum → "arbitrum"
- polygon → "polygon"

**CoinGecko Platform IDs**:
- solana → "solana"
- ethereum → "ethereum"
- bsc → "binance-smart-chain"
- base → "base"

**Moralis Chain Slugs** (EVM only):
- ethereum → "eth"
- bsc → "bsc"
- base → "base"
- arbitrum → "arbitrum"
- polygon → "polygon"

**Helius** (Solana only):
- solana → use Helius DAS API

### Implementation Guidelines

1. **Sequential Fallback**: The cascading fallback system uses sequential async/await (stops at first success), NOT parallel Promise.all (to avoid unnecessary API calls)

2. **Error Handling**: All provider queries use try-catch with graceful degradation (log error, continue to next provider)

3. **Timeouts**: All data provider services implement 8s timeouts per request (worst-case: 5 providers × 8s = 40s max)

4. **Logging**: Use structured logging format: `[TickerResolver] Attempting {provider} for {chain}:{address}`, `[TickerResolver] {provider} returned: {ticker}`

5. **Name Extraction**: Extract first word from name, convert to uppercase, validate 2-10 alphanumeric characters

6. **Final Fallback**: When all providers fail, TickerResolverService returns null, and the handler uses "ANON" as the final fallback
