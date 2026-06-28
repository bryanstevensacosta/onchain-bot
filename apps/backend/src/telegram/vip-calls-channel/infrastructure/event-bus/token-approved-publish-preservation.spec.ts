import { TokenFilteredEvent } from 'token/token-gating/domain/events/token-filtered.event';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';
import { PublishedCallRepository } from 'telegram/shared';
import { TokenApprovedPublishHandler } from './token-approved-publish.handler';
import { VipCallsPublishUseCase } from '../../application/handlers/vip-calls-publish.use-case';
import * as fc from 'fast-check';

/**
 * Preservation Property Tests - Existing Ticker Resolution Unchanged
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * **Property 2: Preservation** - Existing Ticker Resolution Unchanged
 *
 * **IMPORTANT**: Follow observation-first methodology
 *
 * These tests capture the EXISTING behavior that must remain unchanged after the fix:
 * - When token.ticker is not null, handler returns token.ticker without querying providers
 * - When token.ticker is null and snapshot.symbol is not null, handler returns snapshot.symbol
 * - Handler never queries TickerResolverService when ticker is resolved by existing sources
 *
 * **EXPECTED OUTCOME**: Tests PASS on UNFIXED code (confirms baseline behavior to preserve)
 *
 * After the fix is implemented, these tests should STILL PASS (confirms no regressions).
 */

/**
 * Generate a chain-appropriate address based on the chain type
 * - EVM chains (ethereum, bsc, base, arbitrum, polygon): 0x + 40 hex characters
 * - Solana: Use a pool of known valid Solana addresses (Base58 encoded 32-byte values)
 */
function generateAddressForChain(chain: string, seed: string): string {
  if (chain === 'solana') {
    // Use a pool of known valid Solana addresses to avoid Base58 validation issues
    // These are real Solana addresses that pass Base58 decoding to 32 bytes
    const validSolanaAddresses = [
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'So11111111111111111111111111111111111111112', // SOL
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', // mSOL
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
      '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // ETH (Wormhole)
      'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', // HNT
      'kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6', // KIN
      'BLZEEuZUBVqFhj8adcCFPJvPVCiCyVmh3hkJMrU8KuJA', // BLZE
    ];

    // Use seed to deterministically select an address
    let seedNum = 0;
    for (let i = 0; i < seed.length; i++) {
      seedNum += seed.charCodeAt(i);
    }

    return validSolanaAddresses[seedNum % validSolanaAddresses.length];
  } else {
    // EVM chains: 0x + 40 hex characters
    // Use a simple hash-like function to distribute characters more evenly
    const hexChars = '0123456789abcdef';
    let address = '0x';

    // Create a seed hash value
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Generate 40 hex characters using the hash
    for (let i = 0; i < 40; i++) {
      // Mix the hash with the position to get different characters
      const mixedValue = Math.abs(hash * (i + 1) + hash);
      const index = mixedValue % hexChars.length;
      address += hexChars[index];
      // Update hash for next iteration
      hash = ((hash << 3) + hash) ^ mixedValue;
    }

    return address;
  }
}

describe('TokenApprovedPublishHandler - Preservation Properties', () => {
  /**
   * Mock repository that never finds a published call (to avoid duplicate check blocking)
   */
  function mockPublishedCallRepoNeverFound(): PublishedCallRepository {
    return {
      findByChainAndAddress: jest.fn().mockResolvedValue(null),
    } as unknown as PublishedCallRepository;
  }

  /**
   * Property 2.1: Token Ticker Preservation
   *
   * FOR ALL events where token.ticker is not null,
   * the handler MUST return token.ticker without querying external providers.
   *
   * This is a property-based test that generates many test cases to ensure
   * the behavior holds across the entire input domain.
   */
  describe('Property 2.1: Token Ticker Preservation', () => {
    it('should use token.ticker when available, without external resolution (property-based)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary valid ticker strings (2-10 uppercase alphanumeric)
          fc.stringMatching(/^[A-Z0-9]{2,10}$/),
          // Generate arbitrary chain names
          fc.constantFrom(
            'solana',
            'ethereum',
            'bsc',
            'base',
            'arbitrum',
            'polygon',
          ),
          async (ticker, chain) => {
            // Generate chain-appropriate address
            const address = generateAddressForChain(chain, '1');

            // Arrange: Track what ticker value is passed to VipCallsPublishUseCase
            let capturedTicker: string | null | undefined = undefined;
            const executeSpy = jest.fn().mockImplementation(async (input) => {
              capturedTicker = input.ticker;
              return { id: 'test-call-id' };
            });

            const publishUseCase = {
              execute: executeSpy,
            } as unknown as VipCallsPublishUseCase;

            // Token repo returns the generated ticker
            const tokenRepo: CanonicalTokenCallRepository = {
              findByIdentity: jest.fn().mockResolvedValue({
                ticker, // Use generated ticker
                name: 'Test Token',
                sources: [
                  { name: 'telegram-alpha-scanner', url: 'https://t.me/test' },
                ],
                mentionCount: 10,
                bestMetrics: null,
              }),
            } as unknown as CanonicalTokenCallRepository;

            // Snapshot repo returns no symbol (shouldn't be queried since token.ticker exists)
            const snapshotRepo: TokenSnapshotRepository = {
              findByChainAndAddress: jest.fn().mockResolvedValue(null),
            } as unknown as TokenSnapshotRepository;

            const handler = new TokenApprovedPublishHandler(
              publishUseCase,
              tokenRepo,
              snapshotRepo,
              mockPublishedCallRepoNeverFound(),
            );

            // Act: Process event
            const event = new TokenFilteredEvent({
              chain,
              address,
              score: 85,
              classification: 'EXCELLENT',
              decidedAt: new Date(),
            });

            await handler.handle(event);

            // Assert: Handler uses the provided ticker exactly as-is
            // This MUST PASS on unfixed code (existing behavior)
            // This MUST STILL PASS after fix (preservation requirement)
            expect(capturedTicker).toBe(ticker);
          },
        ),
        {
          numRuns: 50, // Run 50 random test cases
        },
      );
    });

    it('should use token.ticker even when snapshot.symbol is available', async () => {
      // Arrange: Token repo has ticker, snapshot repo also has symbol
      let capturedTicker: string | null | undefined = undefined;
      const executeSpy = jest.fn().mockImplementation(async (input) => {
        capturedTicker = input.ticker;
        return { id: 'test-call-id' };
      });

      const publishUseCase = {
        execute: executeSpy,
      } as unknown as VipCallsPublishUseCase;

      const tokenRepo: CanonicalTokenCallRepository = {
        findByIdentity: jest.fn().mockResolvedValue({
          ticker: 'BTC',
          name: 'Bitcoin',
          sources: [
            { name: 'telegram-alpha-scanner', url: 'https://t.me/test' },
          ],
          mentionCount: 100,
          bestMetrics: null,
        }),
      } as unknown as CanonicalTokenCallRepository;

      const snapshotRepo: TokenSnapshotRepository = {
        findByChainAndAddress: jest.fn().mockResolvedValue({
          name: 'Wrapped Bitcoin',
          symbol: 'WBTC', // Different symbol available
          marketCapUsd: 10000000000,
          liquidityUsd: 500000000,
          holders: 50000,
          primaryPair: '0xbtc123',
        }),
      } as unknown as TokenSnapshotRepository;

      const handler = new TokenApprovedPublishHandler(
        publishUseCase,
        tokenRepo,
        snapshotRepo,
        mockPublishedCallRepoNeverFound(),
      );

      // Act
      const event = new TokenFilteredEvent({
        chain: 'ethereum',
        address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        score: 95,
        classification: 'EXCELLENT',
        decidedAt: new Date(),
      });

      await handler.handle(event);

      // Assert: Should prioritize token.ticker over snapshot.symbol
      // Uses "BTC" not "WBTC"
      expect(capturedTicker).toBe('BTC');
    });
  });

  /**
   * Property 2.2: Snapshot Symbol Preservation
   *
   * FOR ALL events where token.ticker is null AND snapshot.symbol is not null,
   * the handler MUST return snapshot.symbol without querying external providers.
   */
  describe('Property 2.2: Snapshot Symbol Preservation', () => {
    it('should use snapshot.symbol when token.ticker is null (property-based)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary valid symbols (2-10 uppercase alphanumeric)
          fc.stringMatching(/^[A-Z0-9]{2,10}$/),
          // Generate arbitrary chain names
          fc.constantFrom(
            'solana',
            'ethereum',
            'bsc',
            'base',
            'arbitrum',
            'polygon',
          ),
          async (symbol, chain) => {
            // Generate chain-appropriate address
            const address = generateAddressForChain(chain, '2');

            // Arrange
            let capturedTicker: string | null | undefined = undefined;
            const executeSpy = jest.fn().mockImplementation(async (input) => {
              capturedTicker = input.ticker;
              return { id: 'test-call-id' };
            });

            const publishUseCase = {
              execute: executeSpy,
            } as unknown as VipCallsPublishUseCase;

            // Token repo returns null (no ticker)
            const tokenRepo: CanonicalTokenCallRepository = {
              findByIdentity: jest.fn().mockResolvedValue(null),
            } as unknown as CanonicalTokenCallRepository;

            // Snapshot repo returns the generated symbol
            const snapshotRepo: TokenSnapshotRepository = {
              findByChainAndAddress: jest.fn().mockResolvedValue({
                name: 'Test Token',
                symbol, // Use generated symbol
                marketCapUsd: 1000000,
                liquidityUsd: 500000,
                holders: 1000,
                primaryPair: '0xabc123',
              }),
            } as unknown as TokenSnapshotRepository;

            const handler = new TokenApprovedPublishHandler(
              publishUseCase,
              tokenRepo,
              snapshotRepo,
              mockPublishedCallRepoNeverFound(),
            );

            // Act
            const event = new TokenFilteredEvent({
              chain,
              address,
              score: 80,
              classification: 'GOOD',
              decidedAt: new Date(),
            });

            await handler.handle(event);

            // Assert: Handler uses the snapshot symbol exactly as-is
            // This MUST PASS on unfixed code (existing behavior)
            // This MUST STILL PASS after fix (preservation requirement)
            expect(capturedTicker).toBe(symbol);
          },
        ),
        {
          numRuns: 50, // Run 50 random test cases
        },
      );
    });

    it('should use snapshot.symbol for well-known tokens', async () => {
      // Arrange: Concrete example with real token
      let capturedTicker: string | null | undefined = undefined;
      const executeSpy = jest.fn().mockImplementation(async (input) => {
        capturedTicker = input.ticker;
        return { id: 'test-call-id' };
      });

      const publishUseCase = {
        execute: executeSpy,
      } as unknown as VipCallsPublishUseCase;

      const tokenRepo: CanonicalTokenCallRepository = {
        findByIdentity: jest.fn().mockResolvedValue(null),
      } as unknown as CanonicalTokenCallRepository;

      const snapshotRepo: TokenSnapshotRepository = {
        findByChainAndAddress: jest.fn().mockResolvedValue({
          name: 'Ethereum',
          symbol: 'ETH',
          marketCapUsd: 200000000000,
          liquidityUsd: 5000000000,
          holders: 1000000,
          primaryPair: '0xeth123',
        }),
      } as unknown as TokenSnapshotRepository;

      const handler = new TokenApprovedPublishHandler(
        publishUseCase,
        tokenRepo,
        snapshotRepo,
        mockPublishedCallRepoNeverFound(),
      );

      // Act
      const event = new TokenFilteredEvent({
        chain: 'ethereum',
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
        score: 90,
        classification: 'EXCELLENT',
        decidedAt: new Date(),
      });

      await handler.handle(event);

      // Assert: Should use existing symbol "ETH" from snapshot
      expect(capturedTicker).toBe('ETH');
    });
  });

  /**
   * Property 2.3: No External Resolution for Known Tickers
   *
   * FOR ALL events where ticker is resolved by existing sources (token.ticker or snapshot.symbol),
   * the handler MUST NOT query TickerResolverService (after fix is implemented).
   *
   * Note: On unfixed code, TickerResolverService doesn't exist yet, so we can't spy on it.
   * This test documents the EXPECTED behavior after the fix.
   * After implementation, we can verify the service is NOT called when ticker is already resolved.
   */
  describe('Property 2.3: No External Resolution When Ticker Available', () => {
    it('should not query external providers when token.ticker is available', async () => {
      // This test documents the preservation requirement:
      // When ticker is available from existing sources, the new TickerResolverService
      // should NOT be called.

      // Arrange: Token repo has ticker
      let capturedTicker: string | null | undefined = undefined;
      const executeSpy = jest.fn().mockImplementation(async (input) => {
        capturedTicker = input.ticker;
        return { id: 'test-call-id' };
      });

      const publishUseCase = {
        execute: executeSpy,
      } as unknown as VipCallsPublishUseCase;

      const tokenRepo: CanonicalTokenCallRepository = {
        findByIdentity: jest.fn().mockResolvedValue({
          ticker: 'DOGE',
          name: 'Dogecoin',
          sources: [
            { name: 'telegram-alpha-scanner', url: 'https://t.me/test' },
          ],
          mentionCount: 1000,
          bestMetrics: null,
        }),
      } as unknown as CanonicalTokenCallRepository;

      const snapshotRepo: TokenSnapshotRepository = {
        findByChainAndAddress: jest.fn().mockResolvedValue(null),
      } as unknown as TokenSnapshotRepository;

      const handler = new TokenApprovedPublishHandler(
        publishUseCase,
        tokenRepo,
        snapshotRepo,
        mockPublishedCallRepoNeverFound(),
      );

      // Act
      const event = new TokenFilteredEvent({
        chain: 'ethereum',
        address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', // SHIB (example)
        score: 85,
        classification: 'EXCELLENT',
        decidedAt: new Date(),
      });

      await handler.handle(event);

      // Assert: Handler uses existing ticker
      expect(capturedTicker).toBe('DOGE');

      // After fix implementation, we should also verify:
      // expect(tickerResolverService.resolveTicker).not.toHaveBeenCalled();
      // But on unfixed code, the service doesn't exist yet.
    });

    it('should not query external providers when snapshot.symbol is available', async () => {
      // Arrange: Snapshot repo has symbol
      let capturedTicker: string | null | undefined = undefined;
      const executeSpy = jest.fn().mockImplementation(async (input) => {
        capturedTicker = input.ticker;
        return { id: 'test-call-id' };
      });

      const publishUseCase = {
        execute: executeSpy,
      } as unknown as VipCallsPublishUseCase;

      const tokenRepo: CanonicalTokenCallRepository = {
        findByIdentity: jest.fn().mockResolvedValue({
          ticker: null, // No ticker from canonical calls
          name: 'Shiba Inu',
          sources: [
            { name: 'telegram-alpha-scanner', url: 'https://t.me/test' },
          ],
          mentionCount: 500,
          bestMetrics: null,
        }),
      } as unknown as CanonicalTokenCallRepository;

      const snapshotRepo: TokenSnapshotRepository = {
        findByChainAndAddress: jest.fn().mockResolvedValue({
          name: 'Shiba Inu',
          symbol: 'SHIB',
          marketCapUsd: 5000000000,
          liquidityUsd: 200000000,
          holders: 1000000,
          primaryPair: '0xshib123',
        }),
      } as unknown as TokenSnapshotRepository;

      const handler = new TokenApprovedPublishHandler(
        publishUseCase,
        tokenRepo,
        snapshotRepo,
        mockPublishedCallRepoNeverFound(),
      );

      // Act
      const event = new TokenFilteredEvent({
        chain: 'ethereum',
        address: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce', // SHIB
        score: 85,
        classification: 'EXCELLENT',
        decidedAt: new Date(),
      });

      await handler.handle(event);

      // Assert: Handler uses existing symbol from snapshot
      expect(capturedTicker).toBe('SHIB');

      // After fix implementation, verify service not called:
      // expect(tickerResolverService.resolveTicker).not.toHaveBeenCalled();
    });
  });

  /**
   * Property 2.4: Event Flow Preservation
   *
   * The handler's event processing flow should remain unchanged:
   * - Event handling structure
   * - Publishing structure
   * - Error handling
   *
   * This test verifies that the core event processing logic is preserved.
   */
  describe('Property 2.4: Event Flow Preservation', () => {
    it('should preserve event handling structure and error handling', async () => {
      // Arrange: Token repo has ticker
      const executeSpy = jest.fn().mockResolvedValue({ id: 'test-call-id' });

      const publishUseCase = {
        execute: executeSpy,
      } as unknown as VipCallsPublishUseCase;

      const findByIdentitySpy = jest.fn().mockResolvedValue({
        ticker: 'TEST',
        name: 'Test Token',
        sources: [{ name: 'telegram-alpha-scanner', url: 'https://t.me/test' }],
        mentionCount: 10,
        bestMetrics: {
          marketCapUsd: 1000000,
          liquidityUsd: 500000,
          holders: 1000,
        },
      });

      const tokenRepo: CanonicalTokenCallRepository = {
        findByIdentity: findByIdentitySpy,
      } as unknown as CanonicalTokenCallRepository;

      const findByChainAndAddressSpy = jest.fn().mockResolvedValue({
        name: 'Test Token',
        symbol: 'TEST',
        marketCapUsd: 1000000,
        liquidityUsd: 500000,
        holders: 1000,
        primaryPair: '0xtest123',
      });

      const snapshotRepo: TokenSnapshotRepository = {
        findByChainAndAddress: findByChainAndAddressSpy,
      } as unknown as TokenSnapshotRepository;

      const handler = new TokenApprovedPublishHandler(
        publishUseCase,
        tokenRepo,
        snapshotRepo,
        mockPublishedCallRepoNeverFound(),
      );

      // Act
      const event = new TokenFilteredEvent({
        chain: 'solana',
        address: 'So11111111111111111111111111111111111111112', // Valid Solana address (SOL)
        score: 85,
        classification: 'EXCELLENT',
        decidedAt: new Date(),
      });

      await handler.handle(event);

      // Assert: VipCallsPublishUseCase.execute was called with correct structure
      expect(executeSpy).toHaveBeenCalledTimes(1);
      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: 'solana',
          address: 'So11111111111111111111111111111111111111112',
          ticker: 'TEST',
          name: 'Test Token',
          score: 85,
          classification: 'EXCELLENT',
          // Other fields...
        }),
      );
    });

    it('should handle errors gracefully (preservation of error handling)', async () => {
      // Arrange: Simulate error in publishing
      const publishUseCase = {
        execute: jest.fn().mockRejectedValue(new Error('Publishing failed')),
      } as unknown as VipCallsPublishUseCase;

      const tokenRepo: CanonicalTokenCallRepository = {
        findByIdentity: jest.fn().mockResolvedValue({
          ticker: 'TEST',
          name: 'Test Token',
          sources: [],
          mentionCount: 1,
          bestMetrics: null,
        }),
      } as unknown as CanonicalTokenCallRepository;

      const snapshotRepo: TokenSnapshotRepository = {
        findByChainAndAddress: jest.fn().mockResolvedValue(null),
      } as unknown as TokenSnapshotRepository;

      const handler = new TokenApprovedPublishHandler(
        publishUseCase,
        tokenRepo,
        snapshotRepo,
        mockPublishedCallRepoNeverFound(),
      );

      // Act & Assert: Should not throw (handler catches errors)
      const event = new TokenFilteredEvent({
        chain: 'solana',
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Valid Solana address (USDC)
        score: 80,
        classification: 'GOOD',
        decidedAt: new Date(),
      });

      await expect(handler.handle(event)).resolves.not.toThrow();
    });
  });

  /**
   * Property 2.5: Ticker Precedence Order Preservation
   *
   * The precedence order for ticker resolution must be preserved:
   * 1. token?.ticker (from canonical_token_calls)
   * 2. snapshot?.symbol (from token_snapshots)
   * 3. (NEW after fix: TickerResolverService cascading fallback)
   * 4. (NEW after fix: "ANON" final fallback)
   *
   * This test verifies the EXISTING precedence (1 and 2) is preserved.
   */
  describe('Property 2.5: Ticker Precedence Order', () => {
    it('should prioritize token.ticker over snapshot.symbol (property-based)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate two different tickers
          fc.stringMatching(/^[A-Z]{2,6}$/),
          fc.stringMatching(/^[A-Z]{2,6}$/),
          fc.constantFrom('solana', 'ethereum', 'bsc'),
          async (tokenTicker, snapshotSymbol, chain) => {
            // Skip if both are the same
            fc.pre(tokenTicker !== snapshotSymbol);

            // Generate chain-appropriate address
            const address = generateAddressForChain(chain, '3');

            let capturedTicker: string | null | undefined = undefined;
            const executeSpy = jest.fn().mockImplementation(async (input) => {
              capturedTicker = input.ticker;
              return { id: 'test-call-id' };
            });

            const publishUseCase = {
              execute: executeSpy,
            } as unknown as VipCallsPublishUseCase;

            const tokenRepo: CanonicalTokenCallRepository = {
              findByIdentity: jest.fn().mockResolvedValue({
                ticker: tokenTicker,
                name: 'Test Token',
                sources: [],
                mentionCount: 1,
                bestMetrics: null,
              }),
            } as unknown as CanonicalTokenCallRepository;

            const snapshotRepo: TokenSnapshotRepository = {
              findByChainAndAddress: jest.fn().mockResolvedValue({
                name: 'Test Token',
                symbol: snapshotSymbol,
                marketCapUsd: 1000000,
                liquidityUsd: 500000,
                holders: 1000,
                primaryPair: '0xtest',
              }),
            } as unknown as TokenSnapshotRepository;

            const handler = new TokenApprovedPublishHandler(
              publishUseCase,
              tokenRepo,
              snapshotRepo,
              mockPublishedCallRepoNeverFound(),
            );

            const event = new TokenFilteredEvent({
              chain,
              address,
              score: 80,
              classification: 'GOOD',
              decidedAt: new Date(),
            });

            await handler.handle(event);

            // Assert: Must use tokenTicker, NOT snapshotSymbol
            expect(capturedTicker).toBe(tokenTicker);
            expect(capturedTicker).not.toBe(snapshotSymbol);
          },
        ),
        {
          numRuns: 30,
        },
      );
    });
  });
});
