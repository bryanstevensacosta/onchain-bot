import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall } from 'telegram/shared';
import { VipCallApprovedEvent } from 'token/vip-call-approval/domain/events/vip-call-approved.event';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';
import { TokenApprovedPublishHandler } from './token-approved-publish.handler';
import { VipCallsPublishUseCase } from '../../application/handlers/vip-calls-publish.use-case';
import { InMemoryPublishedCallRepository } from '../repositories/in-memory-published-call.repository';

/**
 * Bug Condition Exploration Test
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 *
 * **Property 1: Bug Condition** - Duplicate VipCallApprovedEvent Publications
 *
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 *
 * This test encodes the EXPECTED behavior (after fix):
 * - When a VipCallApprovedEvent is emitted for a token already in published_calls
 * - The handler should detect the duplicate and skip publication
 * - VipCallsPublishUseCase.execute() should NOT be called
 *
 * On UNFIXED code, this test will FAIL because:
 * - The handler does NOT check for duplicates
 * - VipCallsPublishUseCase.execute() IS called unconditionally
 * - Multiple Telegram messages would be sent for the same token
 *
 * IMPORTANT: The current handler does NOT have PublishedCallRepository injected yet.
 * These tests demonstrate the EXPECTED behavior once the fix is implemented.
 * Running on UNFIXED code will fail because:
 * 1. Handler doesn't receive the repository
 * 2. Handler doesn't check for duplicates
 * 3. Use case is called unconditionally for every event
 */
describe('TokenApprovedPublishHandler - Bug Condition Exploration', () => {
  const SOLANA_TOKEN = '3i6jxygrsaedj3be2vjxcrqqxhqxq1bpraxbxjprpump';
  const ETHEREUM_TOKEN = '0x2d61bbbe5ad9a8f18fef35940301fd24f143a72b';

  function mockTokenRepo(): CanonicalTokenCallRepository {
    return {
      findByIdentity: jest.fn().mockResolvedValue(null),
    } as unknown as CanonicalTokenCallRepository;
  }

  function mockSnapshotRepo(): TokenSnapshotRepository {
    return {
      findByChainAndAddress: jest.fn().mockResolvedValue(null),
    } as unknown as TokenSnapshotRepository;
  }

  function mockTickerResolver() {
    return {
      resolveTicker: jest.fn().mockResolvedValue('TEST'),
    };
  }

  function createPublishedCall(chain: string, address: string): PublishedCall {
    const chainId = ChainId.fromString(chain);
    return PublishedCall.create(
      {
        chain: chainId,
        address,
        ticker: 'TEST',
        score: 80,
        tier: 'S',
        classification: 'GOOD',
        message: 'Test message',
        targetChannels: ['vip-calls'],
        mcAtCall: 1000000,
        telegramMessageId: 1000,
      },
      { published: ['vip-calls'], failed: [] },
    );
  }

  /**
   * This test simulates the FULL flow including VipCallsPublishUseCase
   * to demonstrate the actual bug: multiple events result in multiple
   * calls to execute(), which would send multiple Telegram messages.
   */
  it('Property 1: Bug Condition - demonstrates duplicate publications occur for Solana token', async () => {
    // Arrange: Repository that will store published calls
    const publishedCallRepo = new InMemoryPublishedCallRepository();

    // Track how many times execute is called (simulates multiple Telegram messages)
    let executeCallCount = 0;
    const executeSpy = jest.fn().mockImplementation(async (input) => {
      executeCallCount++;
      // Simulate what the real use case does: save to repository
      const chainId = ChainId.fromString(input.chain);
      const call = PublishedCall.create(
        {
          chain: chainId,
          address: input.address,
          ticker: input.ticker ?? 'TEST',
          score: input.score,
          tier: 'S',
          classification: input.classification,
          message: 'Test message',
          targetChannels: ['vip-calls'],
          mcAtCall: input.marketCapUsd ?? null,
          telegramMessageId: 1000 + executeCallCount,
        },
        { published: ['vip-calls'], failed: [] },
      );
      await publishedCallRepo.save(call);
      return { id: call.id };
    });

    const publishUseCase = {
      execute: executeSpy,
    } as unknown as VipCallsPublishUseCase;

    const handler = new TokenApprovedPublishHandler(
      publishUseCase,
      mockTokenRepo(),
      mockSnapshotRepo(),
      publishedCallRepo,
      mockTickerResolver(),
    );

    // Act: Emit TWO VipCallApprovedEvent instances for the SAME token
    const event1 = new VipCallApprovedEvent({
      chain: 'solana',
      address: SOLANA_TOKEN,
      score: 85,
      classification: 'EXCELLENT',
      decidedAt: new Date(),
    });

    const event2 = new VipCallApprovedEvent({
      chain: 'solana',
      address: SOLANA_TOKEN,
      score: 90,
      classification: 'EXCELLENT',
      decidedAt: new Date(),
    });

    await handler.handle(event1);
    await handler.handle(event2);

    // Assert EXPECTED behavior (after fix):
    // - execute() should be called ONLY ONCE (for the first event)
    // - The second event should be skipped (duplicate detected)
    //
    // On UNFIXED code:
    // - execute() will be called TWICE
    // - This assertion will FAIL, confirming the bug exists
    expect(executeCallCount).toBe(1);

    // Verify only ONE record exists in the database
    const storedCall = await publishedCallRepo.findByChainAndAddress(
      ChainId.fromString('solana'),
      SOLANA_TOKEN,
    );
    expect(storedCall).not.toBeNull();
    expect(storedCall?.id).toBe(`solana:${SOLANA_TOKEN}`);
  });

  it('Property 1: Bug Condition - demonstrates duplicate publications occur for Ethereum token', async () => {
    // Arrange
    const publishedCallRepo = new InMemoryPublishedCallRepository();

    let executeCallCount = 0;
    const executeSpy = jest.fn().mockImplementation(async (input) => {
      executeCallCount++;
      const chainId = ChainId.fromString(input.chain);
      const call = PublishedCall.create(
        {
          chain: chainId,
          address: input.address,
          ticker: input.ticker ?? 'TEST',
          score: input.score,
          tier: 'S',
          classification: input.classification,
          message: 'Test message',
          targetChannels: ['vip-calls'],
          mcAtCall: input.marketCapUsd ?? null,
          telegramMessageId: 2000 + executeCallCount,
        },
        { published: ['vip-calls'], failed: [] },
      );
      await publishedCallRepo.save(call);
      return { id: call.id };
    });

    const publishUseCase = {
      execute: executeSpy,
    } as unknown as VipCallsPublishUseCase;

    const handler = new TokenApprovedPublishHandler(
      publishUseCase,
      mockTokenRepo(),
      mockSnapshotRepo(),
      publishedCallRepo,
      mockTickerResolver(), // Mock TickerResolverService
    );

    // Act: Emit TWO events for the same Ethereum token
    const event1 = new VipCallApprovedEvent({
      chain: 'ethereum',
      address: ETHEREUM_TOKEN,
      score: 78,
      classification: 'GOOD',
      decidedAt: new Date(),
    });

    const event2 = new VipCallApprovedEvent({
      chain: 'ethereum',
      address: ETHEREUM_TOKEN,
      score: 82,
      classification: 'GOOD',
      decidedAt: new Date(),
    });

    await handler.handle(event1);
    await handler.handle(event2);

    // Assert: Expected behavior (after fix) - only ONE call
    // On UNFIXED code: TWO calls, test will FAIL
    expect(executeCallCount).toBe(1);

    const storedCall = await publishedCallRepo.findByChainAndAddress(
      ChainId.fromString('ethereum'),
      ETHEREUM_TOKEN.toLowerCase(),
    );
    expect(storedCall).not.toBeNull();
  });

  it('Property 1: Bug Condition - first-time publication should always proceed', async () => {
    // Arrange
    const publishedCallRepo = new InMemoryPublishedCallRepository();

    let executeCallCount = 0;
    const executeSpy = jest.fn().mockImplementation(async () => {
      executeCallCount++;
      return { id: 'new-call' };
    });

    const publishUseCase = {
      execute: executeSpy,
    } as unknown as VipCallsPublishUseCase;

    const handler = new TokenApprovedPublishHandler(
      publishUseCase,
      mockTokenRepo(),
      mockSnapshotRepo(),
      publishedCallRepo,
      mockTickerResolver(), // Mock TickerResolverService
    );

    // Act: Emit event for a NEW token (never published before)
    // Using a valid Solana address format (base58, 32-44 chars)
    const newTokenEvent = new VipCallApprovedEvent({
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      score: 90,
      classification: 'EXCELLENT',
      decidedAt: new Date(),
    });

    await handler.handle(newTokenEvent);

    // Assert: Should proceed with publication for new tokens
    // This should PASS on both fixed and unfixed code
    expect(executeCallCount).toBe(1);
  });
});
