# Ticker Unknown Cascade Fallback Bugfix Design

## Overview

This design formalizes the fix for the "UNKNOWN" ticker bug affecting 39% of VIP call posts. The bug occurs when the heuristic parser and database lookups fail to extract a ticker, leaving it null. The fix introduces a TickerResolverService that implements a 9-level cascading fallback system: (1) heuristic parser → (2) canonical_token_calls.ticker → (3) token_snapshots.symbol → (4) DexScreener → (5) GeckoTerminal → (6) CoinGecko → (7) Moralis → (8) Helius → (9) name-based extraction → (10) "ANON" fallback. The service is integrated into TokenApprovedPublishHandler and includes structured logging at each step.

The fix is minimal and targeted: it introduces a new service for ticker resolution, updates the handler to use it, and adds logging. All existing behavior is preserved—the cascading system only activates when existing sources return null.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when ticker is null after existing resolution attempts (heuristic parser, canonical_token_calls.ticker, token_snapshots.symbol)
- **Property (P)**: The desired behavior when ticker is null - execute cascading fallback system and return a valid ticker (or "ANON" as final fallback)
- **Preservation**: Existing ticker resolution (heuristic parser, database lookups) and VIP call publishing flow that must remain unchanged by the fix
- **TokenApprovedPublishHandler**: The event handler in `token-approved-publish.handler.ts` that processes token approval events and publishes VIP calls
- **TickerResolverService**: New service that implements the cascading fallback system for ticker resolution
- **Cascading Fallback**: Sequential attempt to resolve ticker from multiple data providers, stopping at first success
- **Heuristic Parser**: Existing regex-based parser (HeuristicParserAdapter) that extracts ticker from original messages

## Bug Details

### Bug Condition

The bug manifests when a token approval event is processed by TokenApprovedPublishHandler and the ticker resolution logic fails. The handler currently attempts to resolve the ticker in this order: (1) token?.ticker (from canonical_token_calls), (2) snapshot?.symbol (from token_snapshots), (3) null. When all three are null, the VipMessageFormatterAdapter receives null and displays "UNKNOWN".

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { token: CanonicalTokenCall | null, snapshot: TokenSnapshot | null }
  OUTPUT: boolean
  
  RETURN (input.token === null OR input.token.ticker === null)
         AND (input.snapshot === null OR input.snapshot.symbol === null)
         AND NOT externalProviderQueried(input.token?.address, input.snapshot?.address)
END FUNCTION
```

### Examples

- **Token with no metadata in DB**: A newly listed Solana token has no entry in canonical_token_calls and no symbol in token_snapshots → ticker = null → displays "UNKNOWN" (actual observed: 21 out of 54 posts)
- **Token with partial metadata**: A token has canonical_token_calls entry but ticker field is null, and token_snapshots has no symbol → ticker = null → displays "UNKNOWN"
- **Token with name but no symbol**: token_snapshots has name = "Pepe Coin" but symbol = null → ticker = null → displays "UNKNOWN" (should extract "PEPE")
- **External provider has data**: DexScreener has baseToken.symbol = "WOJAK" but the handler never queries it → ticker = null → displays "UNKNOWN"

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Heuristic parser (HeuristicParserAdapter) must continue to extract tickers using regex patterns ($TICKER, Ticker: XYZ, Symbol: XYZ) as the primary source
- When canonical_token_calls.ticker is populated, it must continue to be used as the preferred source after heuristic parsing
- When token_snapshots.symbol is populated, it must continue to be used as the fallback after canonical_token_calls.ticker
- VipMessageFormatterAdapter must continue to format valid tickers as `$${ticker}` without modification
- TokenApprovedPublishHandler event flow must continue unchanged (event handling, publishing structure, error handling)
- All existing data provider services (DexScreener, GeckoTerminal, CoinGecko, Moralis, Helius) must continue to function for other use cases without API contract changes

**Scope:**
All inputs where ticker is successfully resolved by existing sources (heuristic parser, canonical_token_calls.ticker, token_snapshots.symbol) should be completely unaffected by this fix. This includes:
- Tokens with valid ticker in canonical_token_calls
- Tokens with valid symbol in token_snapshots
- Tokens where heuristic parser successfully extracts ticker from message
- All non-VIP-calls use cases of data provider services

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is clear:

1. **Missing Fallback System**: The TokenApprovedPublishHandler only queries two local sources (canonical_token_calls.ticker, token_snapshots.symbol) and has no external provider fallback logic when both are null

2. **No Data Provider Integration**: Multiple data provider services (DexScreener, GeckoTerminal, CoinGecko, Moralis, Helius) are available in the codebase and expose ticker/symbol information, but they are never queried for ticker resolution

3. **No Name-Based Extraction**: When token_snapshots.name is populated but symbol is null, the system does not attempt to derive a ticker from the name (e.g., "Pepe Coin" → "PEPE")

4. **Insufficient Logging**: The handler does not log ticker resolution attempts, making it difficult to diagnose why tickers are null and which data sources were checked

## Correctness Properties

Property 1: Bug Condition - Cascading Fallback Resolves Ticker

_For any_ token approval event where ticker is null after existing resolution attempts (canonical_token_calls.ticker is null AND token_snapshots.symbol is null), the fixed TokenApprovedPublishHandler SHALL execute the cascading fallback system (DexScreener → GeckoTerminal → CoinGecko → Moralis → Helius → name extraction → "ANON") and return a non-null ticker value.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Existing Ticker Resolution Unchanged

_For any_ token approval event where ticker is successfully resolved by existing sources (heuristic parser, canonical_token_calls.ticker, or token_snapshots.symbol), the fixed code SHALL produce exactly the same ticker value as the original code, bypassing the cascading fallback system.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

The fix is minimal and targeted: introduce a new service for ticker resolution and integrate it into the existing handler.

**File 1**: `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/vip-calls-channel/application/services/ticker-resolver.service.ts` (NEW)

**Purpose**: Implements the 9-level cascading fallback system for ticker resolution.

**Service Design**:
```typescript
@Injectable()
export class TickerResolverService {
  constructor(
    private readonly dexScreener: DexScreenerService,
    private readonly geckoTerminal: GeckoTerminalService,
    private readonly coinGecko: CoinGeckoService,
    private readonly moralis: MoralisService,
    private readonly helius: HeliusService,
  ) {}

  /**
   * Resolve ticker using cascading fallback system.
   * Returns null if all sources fail (caller should use "ANON" as final fallback).
   */
  async resolveTicker(params: {
    chain: string;
    address: string;
    name: string | null;
  }): Promise<string | null> {
    // Level 1: DexScreener - getPairsByToken() → pairs[0].baseToken.symbol
    // Level 2: GeckoTerminal - getTokenInfo() → symbol
    // Level 3: CoinGecko - getTokenContractInfo() → symbol (from response)
    // Level 4: Moralis (EVM only) - getTokenMetadata() → symbol
    // Level 5: Helius (Solana only) - getAsset() → content.metadata.symbol
    // Level 6: Name extraction - extractTickerFromName(name)
    // Level 7: Return null (caller uses "ANON")
    
    // Log each attempt with structured logging
  }

  private extractTickerFromName(name: string | null): string | null {
    // Extract first word, uppercase, validate 2-10 chars
  }
}
```

**Specific Implementation Details**:
1. **DexScreener Query**: Call `getPairsByToken(address)`, extract `pairs?.[0]?.baseToken?.symbol`, validate non-empty string
2. **GeckoTerminal Query**: Map chain to network slug (solana, ethereum, bsc, base), call `getTokenInfo(networkSlug, address)`, extract `symbol`
3. **CoinGecko Query**: Map chain to platform ID (solana, ethereum), call `getTokenContractInfo(platform, address)`, extract symbol from response
4. **Moralis Query (EVM only)**: Map chain to Moralis slug (eth, bsc, base), call `getTokenMetadata(address, chain)`, extract `symbol`
5. **Helius Query (Solana only)**: Call `getAsset(address)`, extract `content?.metadata?.symbol`
6. **Name Extraction**: Split name by whitespace/punctuation, take first token, uppercase, validate 2-10 alphanumeric chars
7. **Logging**: Use `this.logger.debug()` with structured format: `[TickerResolver] Attempting {provider} for {chain}:{address}`, `[TickerResolver] {provider} returned: {ticker}`, `[TickerResolver] {provider} failed: {reason}`
8. **Timeouts**: All external provider calls already have 8s timeouts in their service implementations
9. **Error Handling**: Catch all errors, log, continue to next provider (graceful degradation)

**File 2**: `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/token-approved-publish.handler.ts` (MODIFY)

**Purpose**: Integrate TickerResolverService into existing ticker resolution logic.

**Specific Changes**:
1. **Inject TickerResolverService**: Add constructor parameter `private readonly tickerResolver: TickerResolverService`
2. **Update Ticker Resolution Logic**: Change existing logic from:
   ```typescript
   const ticker = token?.ticker ?? snapshot?.symbol ?? null;
   ```
   To:
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
3. **Preserve Existing Flow**: No changes to event handling, publishing structure, or error handling—only inject fallback logic when ticker is null

**File 3**: `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/vip-calls-channel/vip-calls.module.ts` (MODIFY)

**Purpose**: Register TickerResolverService in NestJS dependency injection.

**Specific Changes**:
1. **Import DataProviderModule**: Add `DataProviderModule` to imports array (provides DexScreenerService, GeckoTerminalService, CoinGeckoService, MoralisService, HeliusService)
2. **Add Provider**: Add `TickerResolverService` to providers array
3. **No Export Needed**: Service is internal to VipCallsModule

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

### Performance Considerations

**Async/Await**: All provider queries are async and return immediately on null (no blocking). TickerResolverService uses sequential async/await (stop at first success), not parallel Promise.all (avoids unnecessary API calls).

**Timeouts**: All data provider services already implement 8s timeouts per request. Worst-case scenario: 5 providers × 8s = 40s max (very rare, most will fail fast on 404).

**Circuit Breaker**: Not implemented in initial fix. If needed in future, can add circuit breaker per provider to skip failing providers for N minutes after M consecutive failures.

**Caching**: Not implemented in initial fix. Provider services may have their own caching. If needed in future, can add LRU cache in TickerResolverService with 1-hour TTL.

**Rate Limiting**: Provider services already implement rate limiting via their respective APIs. DexScreener and GeckoTerminal are free (60 req/min). CoinGecko, Moralis, Helius require API keys (already configured).

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code (ticker = null in production data), then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that 39% of tokens have null ticker after DB lookups.

**Test Plan**: Write tests that simulate token approval events with null ticker (token?.ticker = null, snapshot?.symbol = null) and assert that the unfixed handler returns ticker = null. Optionally, query production logs to confirm 21 out of 54 posts had "UNKNOWN" ticker.

**Test Cases**:
1. **Newly Listed Token Test**: Simulate event with token = null, snapshot = null (will fail on unfixed code with ticker = null)
2. **Partial Metadata Test**: Simulate event with token.ticker = null, snapshot.symbol = null (will fail on unfixed code with ticker = null)
3. **Name-Only Metadata Test**: Simulate event with snapshot.name = "Pepe Coin", snapshot.symbol = null (will fail on unfixed code with ticker = null, should extract "PEPE")
4. **External Provider Has Data Test**: Mock DexScreener to return symbol = "WOJAK", verify unfixed code does not query it (will fail with ticker = null)

**Expected Counterexamples**:
- Unfixed code returns ticker = null when DB lookups fail
- Unfixed code does not query external providers (DexScreener, GeckoTerminal, etc.)
- Unfixed code does not extract ticker from name

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (ticker = null after DB lookups), the fixed function executes the cascading fallback system and returns a valid ticker.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handleTokenApprovalEvent_fixed(input)
  ASSERT result.ticker !== null
  ASSERT result.ticker IN [validTickerFromProvider, "ANON"]
END FOR
```

**Test Plan**: Write unit tests for TickerResolverService that mock each provider response and verify the service returns the correct ticker. Write integration tests for TokenApprovedPublishHandler that verify the service is called when ticker is null.

**Test Cases**:
1. **DexScreener Success**: Mock DexScreener to return symbol = "PEPE", verify resolveTicker() returns "PEPE"
2. **GeckoTerminal Fallback**: Mock DexScreener to return null, GeckoTerminal to return symbol = "DOGE", verify resolveTicker() returns "DOGE"
3. **CoinGecko Fallback**: Mock DexScreener and GeckoTerminal to return null, CoinGecko to return symbol = "SHIB", verify resolveTicker() returns "SHIB"
4. **Moralis Fallback (EVM)**: Mock DexScreener, GeckoTerminal, CoinGecko to return null, Moralis to return symbol = "FLOKI", verify resolveTicker() returns "FLOKI"
5. **Helius Fallback (Solana)**: Mock all providers to return null, Helius to return symbol = "BONK", verify resolveTicker() returns "BONK"
6. **Name Extraction**: Mock all providers to return null, pass name = "Pepe Coin", verify resolveTicker() returns "PEPE"
7. **Final Fallback**: Mock all providers and name extraction to return null, verify handler uses "ANON"

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (ticker is successfully resolved by existing sources), the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleTokenApprovalEvent_original(input).ticker = handleTokenApprovalEvent_fixed(input).ticker
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first (ticker resolution from token?.ticker and snapshot?.symbol), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Token Ticker Preservation**: Simulate event with token.ticker = "BTC", verify fixed handler returns "BTC" without querying providers
2. **Snapshot Symbol Preservation**: Simulate event with token.ticker = null, snapshot.symbol = "ETH", verify fixed handler returns "ETH" without querying providers
3. **Heuristic Parser Preservation**: Verify heuristic parser continues to extract tickers from messages (out of scope for this service, but should be tested in integration)
4. **Event Flow Preservation**: Verify event handling, publishing structure, error handling remain unchanged

### Unit Tests

- Test TickerResolverService with mocked provider responses for each fallback level
- Test extractTickerFromName() with various name formats (single word, multi-word, special chars, edge cases)
- Test chain mapping logic (GeckoTerminal slugs, CoinGecko platforms, Moralis slugs)
- Test error handling (provider throws exception, continues to next provider)
- Test logging (verify structured log messages are emitted at each step)

### Property-Based Tests

- Generate random token approval events with valid ticker (token.ticker or snapshot.symbol) and verify fixed handler returns same ticker as original
- Generate random token approval events with null ticker and verify fixed handler returns non-null ticker (either from provider or "ANON")
- Generate random chain/address combinations and verify provider queries use correct chain mappings
- Generate random token names and verify name extraction produces valid tickers (2-10 alphanumeric chars)

### Integration Tests

- Test full event flow with real provider services (use test API keys or mock endpoints)
- Test that fixed handler calls TickerResolverService when ticker is null
- Test that fixed handler skips TickerResolverService when ticker is not null
- Test that VipMessageFormatterAdapter formats resolved tickers correctly
- Test that published VIP call messages display resolved tickers instead of "UNKNOWN"
