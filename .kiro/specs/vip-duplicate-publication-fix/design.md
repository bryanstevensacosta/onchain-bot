# VIP Duplicate Publication Fix Design

## Overview

The VIP calls publication system sends duplicate Telegram messages when the same token receives multiple `TokenFilteredEvent` emissions. The fix adds a publication status check before processing events, ensuring each unique token (chain + address) is published exactly once. The implementation adds a single query to `PublishedCallRepository` in `TokenApprovedPublishHandler` before delegating to `VipCallsPublishUseCase`, making the fix minimal and non-invasive.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when a `TokenFilteredEvent` is emitted for a token (chain + address) that already exists in the `published_calls` table
- **Property (P)**: The desired behavior when C(X) holds - the handler should skip publication and log the duplicate attempt
- **Preservation**: All existing publication logic, message formatting, database persistence, milestone event emission, and error handling must remain unchanged
- **TokenApprovedPublishHandler**: The event handler in `token-approved-publish.handler.ts` that listens for `TokenFilteredEvent` and triggers publication
- **VipCallsPublishUseCase**: The application service in `vip-calls-publish.use-case.ts` that orchestrates message formatting, Telegram publishing, and database persistence
- **PublishedCallRepository**: The repository interface providing `findByChainAndAddress()` to check if a token was previously published
- **TokenFilteredEvent**: The domain event emitted when a token passes approval filters, containing chain, address, score, and classification

## Bug Details

### Bug Condition

The bug manifests when a `TokenFilteredEvent` is emitted for a token that has already been published to the VIP calls channel. The `TokenApprovedPublishHandler` does not check the `published_calls` table before calling `VipCallsPublishUseCase.execute()`, resulting in duplicate Telegram messages for the same token.

**Formal Specification:**
```
FUNCTION isBugCondition(event)
  INPUT: event of type TokenFilteredEvent
  OUTPUT: boolean
  
  LET chain = ChainId.fromString(event.payload.chain)
  LET normalizedAddress = chain.isEvm 
    ? event.payload.address.toLowerCase() 
    : event.payload.address
  LET existingCall = PublishedCallRepository.findByChainAndAddress(chain, normalizedAddress)
  
  RETURN existingCall IS NOT NULL
         AND handler does NOT check existingCall before publishing
         AND VipCallsPublishUseCase.execute() is called unconditionally
END FUNCTION
```

### Examples

**Duplicate Publication Example (Solana):**
- **Event 1**: `TokenFilteredEvent` for `solana:3i6jxygrsaedj3be2vjxcrqqxhqxq1bpraxbxjprpump` with score 85
  - Handler calls `VipCallsPublishUseCase.execute()`
  - Telegram message ID 1075 is sent
  - Database persists `published_calls` record with ID `solana:3i6jxygrsaedj3be2vjxcrqqxhqxq1bpraxbxjprpump`
- **Event 2**: Another `TokenFilteredEvent` for the same token
  - Handler calls `VipCallsPublishUseCase.execute()` again (no check)
  - Telegram message ID 1076 is sent (duplicate)
  - Database save fails silently due to primary key constraint (or overwrites the record)

**Duplicate Publication Example (Ethereum):**
- **Event 1**: `TokenFilteredEvent` for `ethereum:0x2d61bbbe5ad9a8f18fef35940301fd24f143a72b` with score 78
  - Telegram message ID 1077 is sent
  - Database record created
- **Event 2**: Another `TokenFilteredEvent` for the same token
  - Telegram message ID 1078 is sent (duplicate)
  - Database may fail to save second record

**Expected Behavior (After Fix):**
- **Event 1**: First `TokenFilteredEvent` for a token
  - Handler checks `findByChainAndAddress()` → returns `null`
  - Publication proceeds normally
- **Event 2**: Subsequent `TokenFilteredEvent` for the same token
  - Handler checks `findByChainAndAddress()` → returns existing `PublishedCall`
  - Handler logs: "Token {chain}:{address} already published, skipping duplicate publication"
  - Handler returns early, no duplicate message sent

**Edge Case - Multiple Events in Flight:**
- If two `TokenFilteredEvent` instances are processed concurrently before either completes database save:
  - Both handlers may pass the duplicate check
  - Both may attempt to publish
  - Database save will serialize, second save will update existing record
  - This is acceptable as duplicate detection is best-effort, and database constraint provides final safety net

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Token publication flow for first-time publications must continue exactly as before
- Message formatting with `MessageFormatterPort.format()` must remain unchanged
- Telegram message publishing with `TelegramPublisherPort.sendMessage()` must remain unchanged
- Database persistence of `PublishedCall` records must remain unchanged
- Event emission (`CallPublishedEvent`, `CallPublishFailedEvent`) must remain unchanged
- Milestone registration (`RegisterCallForMilestonesEvent`) must remain unchanged
- Error handling and logging must remain unchanged
- Token metadata assembly from `CanonicalTokenCallRepository` and `TokenSnapshotRepository` must remain unchanged

**Scope:**
All inputs where the token (chain + address) has NOT been previously published should be completely unaffected by this fix. This includes:
- First-time `TokenFilteredEvent` emissions for new tokens
- Publication logic after the duplicate check passes
- All downstream effects (database saves, event emissions, milestone tracking)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is clear:

1. **Missing Duplicate Check**: The `TokenApprovedPublishHandler.handle()` method does not query `PublishedCallRepository.findByChainAndAddress()` before calling `VipCallsPublishUseCase.execute()`
   - The handler immediately fetches token metadata from repositories
   - The handler constructs the publication input
   - The handler calls `publish.execute()` without checking prior publication status

2. **Event-Driven Architecture Side Effect**: The system uses event-driven architecture where multiple subsystems may emit `TokenFilteredEvent` for the same token
   - Token approval may be re-evaluated when metadata updates
   - Periodic rescoring may re-emit approval events
   - Manual re-approval triggers may emit duplicate events

3. **No Idempotency Guard**: The `VipCallsPublishUseCase` is not designed to be idempotent
   - It always calls `TelegramPublisherPort.sendMessage()`
   - It always saves to `PublishedCallRepository`
   - It has no awareness of prior publication state

4. **Database Constraint Insufficient**: While the database has a primary key constraint on `id` (chain:address), this only prevents duplicate rows, not duplicate Telegram messages
   - The Telegram message is sent BEFORE the database save
   - If the save fails, the duplicate message has already been sent
   - The save operation uses `save()` which may UPDATE existing records rather than throwing an error

## Correctness Properties

Property 1: Bug Condition - Duplicate Publication Prevention

_For any_ `TokenFilteredEvent` where the token (chain + address) already exists in the `published_calls` table, the fixed handler SHALL query `PublishedCallRepository.findByChainAndAddress()`, detect the existing record, log the duplicate attempt, and return early without calling `VipCallsPublishUseCase.execute()`, preventing duplicate Telegram messages.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - First-Time Publication Behavior

_For any_ `TokenFilteredEvent` where the token (chain + address) does NOT exist in the `published_calls` table, the fixed handler SHALL produce exactly the same behavior as the original handler, proceeding with metadata fetching, message formatting, Telegram publishing, database persistence, and event emission.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/token-approved-publish.handler.ts`

**Function**: `TokenApprovedPublishHandler.handle(event: TokenFilteredEvent)`

**Specific Changes**:

1. **Add Duplicate Check Before Metadata Fetching**: Inject `PublishedCallRepository` into the handler constructor and add a duplicate check at the start of `handle()`
   - After parsing `chainId` and `address` (using the same normalization logic as `VipCallsPublishUseCase`)
   - Query `this.publishedCallRepo.findByChainAndAddress(chainId, normalizedAddress)`
   - If a record exists, log the duplicate and return early

2. **Normalize Address Consistently**: Ensure address normalization matches the logic in `PublishedCall.create()`
   - For EVM chains: `address.toLowerCase()`
   - For Solana chains: use address as-is
   - This ensures the duplicate check uses the same ID format as database records

3. **Add Logging for Duplicate Detection**: Log when duplicates are detected for observability
   - Log level: `INFO` (not `WARN` since this is expected behavior after the fix)
   - Message format: `Token ${chain}:${address} already published, skipping duplicate publication`

4. **Preserve Error Handling**: Keep the existing try-catch block to handle errors during the duplicate check
   - If `findByChainAndAddress()` throws an error, log a warning and proceed with publication (fail open)
   - This ensures transient database issues don't block new publications

5. **No Changes to VipCallsPublishUseCase**: The use case remains unchanged, as the idempotency guard is better placed in the event handler
   - The use case is a reusable application service that may be called from other contexts
   - The event handler is the appropriate place for event-specific duplicate detection

**Implementation Pseudocode**:
```typescript
@Injectable()
export class TokenApprovedPublishHandler {
  private readonly logger = new Logger(TokenApprovedPublishHandler.name);

  constructor(
    private readonly publish: VipCallsPublishUseCase,
    private readonly tokenRepo: CanonicalTokenCallRepository,
    private readonly snapshotRepo: TokenSnapshotRepository,
    private readonly publishedCallRepo: PublishedCallRepository, // NEW: Inject repository
  ) {}

  @OnEvent(TokenFilteredEvent.EVENT_NAME, { async: true })
  async handle(event: TokenFilteredEvent): Promise<void> {
    try {
      const chainId = ChainId.fromString(event.payload.chain);
      const addressLower = event.payload.address.toLowerCase();
      const normalizedAddress = chainId.isEvm ? addressLower : event.payload.address;

      // NEW: Check for duplicate publication
      const existing = await this.publishedCallRepo.findByChainAndAddress(
        chainId,
        normalizedAddress,
      );
      if (existing) {
        this.logger.log(
          `Token ${chainId.value}:${normalizedAddress} already published, skipping duplicate publication`,
        );
        return; // Early return prevents duplicate
      }

      // EXISTING: Continue with publication logic
      const family = chainId.isEvm ? ChainFamily.EVM : ChainFamily.SOLANA;
      const address = chainId.isEvm
        ? NormalizedAddress.fromEvm(addressLower)
        : NormalizedAddress.fromSolana(event.payload.address);

      const [token, snapshot] = await Promise.all([
        this.tokenRepo.findByIdentity(family, address),
        this.snapshotRepo.findByChainAndAddress(chainId, addressLower),
      ]);

      // ... rest of existing logic unchanged
      await this.publish.execute({ ... });
    } catch (err) {
      this.logger.warn(
        `Publish-on-approval failed for ${event.payload.chain}:${event.payload.address}: ${(err as Error).message}`,
      );
    }
  }
}
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that duplicate `TokenFilteredEvent` emissions result in duplicate Telegram messages and database inconsistencies.

**Test Plan**: Write integration tests that emit multiple `TokenFilteredEvent` instances for the same token and observe the system's behavior on UNFIXED code. Verify that duplicate Telegram messages are sent and that only one database record is persisted (or the second save updates the first).

**Test Cases**:
1. **Duplicate Event for Solana Token**: Emit two `TokenFilteredEvent` instances for `solana:3i6jxygrsaedj3be2vjxcrqqxhqxq1bpraxbxjprpump`
   - Expected on unfixed code: Two Telegram messages sent, one database record
   - Verifies: Bug manifests for Solana tokens

2. **Duplicate Event for Ethereum Token**: Emit two `TokenFilteredEvent` instances for `ethereum:0x2d61bbbe5ad9a8f18fef35940301fd24f143a72b`
   - Expected on unfixed code: Two Telegram messages sent, one database record
   - Verifies: Bug manifests for EVM tokens with address normalization

3. **Three Sequential Events**: Emit three `TokenFilteredEvent` instances for the same token in sequence
   - Expected on unfixed code: Three Telegram messages sent
   - Verifies: Bug persists across multiple duplicate emissions

4. **Concurrent Events**: Emit two `TokenFilteredEvent` instances for the same token concurrently (race condition test)
   - Expected on unfixed code: Two Telegram messages sent, possible database race condition
   - Verifies: Concurrent event processing does not provide natural duplicate protection

**Expected Counterexamples**:
- Multiple Telegram messages with different message IDs for the same token
- Database shows only one `published_calls` record (last save wins) or fails on second save
- No logging indicating duplicate detection (since the check doesn't exist)

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (duplicate events), the fixed handler prevents duplicate publications.

**Pseudocode:**
```
FOR ALL event WHERE isBugCondition(event) DO
  result := TokenApprovedPublishHandler.handle(event)
  ASSERT NO Telegram message was sent
  ASSERT log contains "already published, skipping duplicate publication"
  ASSERT VipCallsPublishUseCase.execute() was NOT called
END FOR
```

**Test Cases**:
1. **Duplicate Detection for Existing Token**: Persist a `PublishedCall` record, then emit a `TokenFilteredEvent` for the same token
   - Expected: Handler logs duplicate and returns early
   - Verifies: Duplicate check works correctly

2. **Case-Insensitive Duplicate Detection (EVM)**: Persist a record with lowercase address, emit event with mixed-case address
   - Expected: Handler detects duplicate (address normalization works)
   - Verifies: Address normalization is consistent

3. **Solana Address Handling**: Persist a record with Solana address, emit event with same address (case-sensitive)
   - Expected: Handler detects duplicate
   - Verifies: Solana addresses are handled correctly without lowercasing

4. **Mock Repository Injection**: Use a mocked `PublishedCallRepository` to test duplicate detection without database dependency
   - Expected: Handler queries repository and respects returned value
   - Verifies: Repository integration works correctly

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (first-time publications), the fixed handler produces the same result as the original handler.

**Pseudocode:**
```
FOR ALL event WHERE NOT isBugCondition(event) DO
  ASSERT TokenApprovedPublishHandler_original.handle(event) 
       = TokenApprovedPublishHandler_fixed.handle(event)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (different chains, addresses, scores, classifications)
- It catches edge cases that manual unit tests might miss (address formats, null values, error conditions)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for first-time publications, then write property-based tests capturing that behavior.

**Test Cases**:
1. **First-Time Publication Preservation**: For tokens NOT in the database, verify the handler calls `VipCallsPublishUseCase.execute()` with correct arguments
   - Expected: Message formatting, Telegram publishing, database save, event emission all work identically
   - Verifies: First-time publication flow is unchanged

2. **Metadata Assembly Preservation**: Verify token metadata from `CanonicalTokenCallRepository` and `TokenSnapshotRepository` is assembled identically
   - Expected: ticker, name, marketCapUsd, liquidityUsd, holderCount, chart URL all match original logic
   - Verifies: Metadata fetching is unchanged

3. **Error Handling Preservation**: Emit events that cause errors (invalid chain, repository failure, Telegram API failure)
   - Expected: Handler logs warnings and does not crash, identical to original behavior
   - Verifies: Error handling is unchanged

4. **Event Emission Preservation**: Verify `RegisterCallForMilestonesEvent` is emitted for successful publications with valid market cap
   - Expected: Event is emitted identically to original handler
   - Verifies: Downstream milestone tracking is unchanged

### Unit Tests

- Test `TokenApprovedPublishHandler.handle()` with mocked `PublishedCallRepository` returning `null` (first-time publication)
- Test `TokenApprovedPublishHandler.handle()` with mocked `PublishedCallRepository` returning existing `PublishedCall` (duplicate detection)
- Test address normalization for EVM chains (lowercase) and Solana chains (preserve case)
- Test error handling when `findByChainAndAddress()` throws an exception (fail open)
- Test logging output for duplicate detection
- Test that `VipCallsPublishUseCase.execute()` is not called when duplicates are detected

### Property-Based Tests

- Generate random `TokenFilteredEvent` instances (varying chain, address, score, classification) and verify first-time publications proceed normally
- Generate random sequences of duplicate events (same token, different event instances) and verify only the first results in publication
- Generate random token metadata (ticker, name, market cap, etc.) and verify message formatting is identical to original handler
- Test across many scenarios to ensure preservation of all existing behaviors

### Integration Tests

- Test full event flow with NestJS EventEmitter2 emitting `TokenFilteredEvent` instances
- Test database integration with real TypeORM repository and PostgreSQL
- Test Telegram API integration with mocked `TelegramPublisherPort` to verify message sending
- Test end-to-end flow: emit event → handler processes → database persisted → events emitted → milestones registered
- Test concurrent duplicate event processing to verify database constraint provides final safety net
