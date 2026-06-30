import { VipCallApprovedEvent } from 'token/vip-call-approval/domain/events/vip-call-approved.event';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';
import { TokenApprovedPublishHandler } from './token-approved-publish.handler';
import { VipCallsPublishUseCase } from '../../application/handlers/vip-calls-publish.use-case';
import { PublishedCallRepository } from 'telegram/shared';
import { TickerResolverService } from '../../application/services/ticker-resolver.service';

/**
 * Bug Condition Exploration Test - Ticker Null After DB Lookups
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 *
 * **Property 1: Bug Condition** - Null Ticker After DB Lookups
 *
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 *
 * **GOAL**: Surface counterexamples that demonstrate the bug exists (39% of VIP calls show "UNKNOWN")
 *
 * This test encodes the EXPECTED behavior (after fix):
 * - When token?.ticker = null AND snapshot?.symbol = null
 * - The handler SHOULD call TickerResolverService to query external providers
 * - The resolved ticker SHOULD be non-null (either from provider or "ANON")
 *
 * On UNFIXED code, this test will FAIL because:
 * - The handler does NOT call TickerResolverService (it doesn't exist yet)
 * - The handler does NOT query external providers (DexScreener, GeckoTerminal, etc.)
 * - The handler does NOT extract ticker from name
 * - VipCallsPublishUseCase.execute() receives ticker = null
 * - VipMessageFormatterAdapter displays "UNKNOWN"
 *
 * IMPORTANT: The current handler does NOT have TickerResolverService injected yet.
 * These tests demonstrate the EXPECTED behavior once the fix is implemented.
 */
describe('TokenApprovedPublishHandler - Ticker Null Bug Exploration', () => {
  const SOLANA_TOKEN_NO_METADATA =
    '3i6jxygrsaedj3be2vjxcrqqxhqxq1bpraxbxjprpump';
  const ETHEREUM_TOKEN_NO_SYMBOL = '0x2d61bbbe5ad9a8f18fef35940301fd24f143a72b';

  /**
   * Mock repository that returns null for both ticker and symbol
   * Simulates: Token with no entry in canonical_token_calls
   */
  function mockTokenRepoWithNoTicker(): CanonicalTokenCallRepository {
    return {
      findByIdentity: jest.fn().mockResolvedValue(null),
    } as unknown as CanonicalTokenCallRepository;
  }

  /**
   * Mock repository that returns null for symbol
   * Simulates: Token with no symbol in token_snapshots
   */
  function mockSnapshotRepoWithNoSymbol(): TokenSnapshotRepository {
    return {
      findByChainAndAddress: jest.fn().mockResolvedValue(null),
    } as unknown as TokenSnapshotRepository;
  }

  /**
   * Mock repository that returns name but no symbol
   * Simulates: Token with name = "Pepe Coin" but symbol = null
   */
  /**
   * Mock PublishedCallRepository that returns null (no existing publication)
   */
  function mockPublishedCallRepo(
    returnValue: any = null,
  ): PublishedCallRepository {
    return {
      findByChainAndAddress: jest.fn().mockResolvedValue(returnValue),
    } as unknown as PublishedCallRepository;
  }

  /**
   * Mock TickerResolverService that returns null (all providers fail)
   * This simulates the cascading fallback failing, causing handler to use "ANON"
   */
  function mockTickerResolver(
    returnValue: string | null = null,
  ): TickerResolverService {
    return {
      resolveTicker: jest.fn().mockResolvedValue(returnValue),
    } as unknown as TickerResolverService;
  }

  /**
   * Bug Condition Case 1: Newly Listed Token
   *
   * When: Token has no entry in canonical_token_calls AND no symbol in token_snapshots
   * Expected (after fix): Handler queries external providers and returns valid ticker or "ANON"
   * Actual (unfixed): Handler returns ticker = null, displays "UNKNOWN"
   */
  it('Property 1: Bug Condition - newly listed Solana token with no DB metadata returns null ticker', async () => {
    // Arrange: Track what ticker value is passed to VipCallsPublishUseCase
    let capturedTicker: string | null | undefined = undefined;
    const executeSpy = jest.fn().mockImplementation(async (input) => {
      capturedTicker = input.ticker;
      return { id: 'test-call-id' };
    });

    const publishUseCase = {
      execute: executeSpy,
    } as unknown as VipCallsPublishUseCase;

    const handler = new TokenApprovedPublishHandler(
      publishUseCase,
      mockTokenRepoWithNoTicker(),
      mockSnapshotRepoWithNoSymbol(),
      mockPublishedCallRepo(null), // No existing publication
      mockTickerResolver(null), // All providers fail, returns null
    );

    // Act: Process event for token with no metadata in DB
    const event = new VipCallApprovedEvent({
      chain: 'solana',
      address: SOLANA_TOKEN_NO_METADATA,
      score: 85,
      classification: 'EXCELLENT',
      decidedAt: new Date(),
    });

    await handler.handle(event);

    // Assert EXPECTED behavior (after fix):
    // - Handler should call TickerResolverService
    // - Ticker should be non-null (either from provider or "ANON")
    //
    // On UNFIXED code:
    // - capturedTicker will be NULL
    // - This assertion will FAIL, confirming the bug exists
    expect(capturedTicker).not.toBeNull();
    expect(capturedTicker).toBe('ANON'); // Final fallback if all providers fail
  });

  /**
   * Bug Condition Case 2: Token with Partial Metadata
   *
   * When: Token has canonical_token_calls entry but ticker = null, and snapshot has no symbol
   * Expected (after fix): Handler queries external providers
   * Actual (unfixed): Handler returns ticker = null
   */
  it('Property 1: Bug Condition - token with partial metadata returns null ticker', async () => {
    // Arrange: Token repo returns entry with null ticker
    const tokenRepoWithNullTicker: CanonicalTokenCallRepository = {
      findByIdentity: jest.fn().mockResolvedValue({
        ticker: null, // Entry exists but ticker is null
        name: 'Unknown Token',
        sources: [{ name: 'telegram-alpha-scanner', url: 'https://t.me/test' }],
        mentionCount: 5,
        bestMetrics: null,
      }),
    } as unknown as CanonicalTokenCallRepository;

    let capturedTicker: string | null | undefined = undefined;
    const executeSpy = jest.fn().mockImplementation(async (input) => {
      capturedTicker = input.ticker;
      return { id: 'test-call-id' };
    });

    const publishUseCase = {
      execute: executeSpy,
    } as unknown as VipCallsPublishUseCase;

    const handler = new TokenApprovedPublishHandler(
      publishUseCase,
      tokenRepoWithNullTicker,
      mockSnapshotRepoWithNoSymbol(),
      mockPublishedCallRepo(null), // No existing publication
      mockTickerResolver(null), // All providers fail, returns null
    );

    // Act
    const event = new VipCallApprovedEvent({
      chain: 'ethereum',
      address: ETHEREUM_TOKEN_NO_SYMBOL,
      score: 75,
      classification: 'GOOD',
      decidedAt: new Date(),
    });

    await handler.handle(event);

    // Assert: Expected behavior is non-null ticker (after fix)
    // On UNFIXED code: ticker will be NULL, test FAILS
    expect(capturedTicker).not.toBeNull();
    expect(capturedTicker).toBe('ANON');
  });

  /**
   * Preservation Test: Tokens with Valid Ticker Should Be Unchanged
   *
   * When: Token has valid ticker in canonical_token_calls
   * Expected: Handler uses that ticker, does NOT query providers
   * This should PASS on both fixed and unfixed code (preservation requirement)
   */
  it('Preservation: token with valid ticker in DB should skip external resolution', async () => {
    // Arrange: Token repo returns valid ticker
    const tokenRepoWithValidTicker: CanonicalTokenCallRepository = {
      findByIdentity: jest.fn().mockResolvedValue({
        ticker: 'BTC',
        name: 'Bitcoin',
        sources: [{ name: 'telegram-alpha-scanner', url: 'https://t.me/test' }],
        mentionCount: 100,
        bestMetrics: null,
      }),
    } as unknown as CanonicalTokenCallRepository;

    let capturedTicker: string | null | undefined = undefined;
    const executeSpy = jest.fn().mockImplementation(async (input) => {
      capturedTicker = input.ticker;
      return { id: 'test-call-id' };
    });

    const publishUseCase = {
      execute: executeSpy,
    } as unknown as VipCallsPublishUseCase;

    const handler = new TokenApprovedPublishHandler(
      publishUseCase,
      tokenRepoWithValidTicker,
      mockSnapshotRepoWithNoSymbol(),
    );

    // Act
    const event = new VipCallApprovedEvent({
      chain: 'ethereum',
      address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
      score: 95,
      classification: 'EXCELLENT',
      decidedAt: new Date(),
    });

    await handler.handle(event);

    // Assert: Should use existing ticker "BTC" without external resolution
    // This PASSES on both fixed and unfixed code (preservation)
    expect(capturedTicker).toBe('BTC');
  });

  /**
   * Preservation Test: Tokens with Valid Symbol in Snapshot Should Be Unchanged
   *
   * When: snapshot has valid symbol
   * Expected: Handler uses that symbol, does NOT query providers
   */
  it('Preservation: token with valid symbol in snapshot should skip external resolution', async () => {
    // Arrange: Snapshot repo returns valid symbol
    const snapshotRepoWithSymbol: TokenSnapshotRepository = {
      findByChainAndAddress: jest.fn().mockResolvedValue({
        name: 'Ethereum',
        symbol: 'ETH',
        marketCapUsd: 200000000000,
        liquidityUsd: 5000000000,
        holders: 1000000,
        primaryPair: '0xeth123',
      }),
    } as unknown as TokenSnapshotRepository;

    let capturedTicker: string | null | undefined = undefined;
    const executeSpy = jest.fn().mockImplementation(async (input) => {
      capturedTicker = input.ticker;
      return { id: 'test-call-id' };
    });

    const publishUseCase = {
      execute: executeSpy,
    } as unknown as VipCallsPublishUseCase;

    const handler = new TokenApprovedPublishHandler(
      publishUseCase,
      mockTokenRepoWithNoTicker(),
      snapshotRepoWithSymbol,
    );

    // Act
    const event = new VipCallApprovedEvent({
      chain: 'ethereum',
      address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
      score: 90,
      classification: 'EXCELLENT',
      decidedAt: new Date(),
    });

    await handler.handle(event);

    // Assert: Should use existing symbol "ETH" without external resolution
    // This PASSES on both fixed and unfixed code (preservation)
    expect(capturedTicker).toBe('ETH');
  });
});
