import * as fc from 'fast-check';
import { TrackPublishedCallUseCase } from './track-published-call.use-case';
import {
  TrackedPublishedCallRepository,
  TrackedPublishedCallRecord,
} from '../ports/tracked-published-call.repository';
import { PublishedCallRepository } from 'telegram/shared/application/ports/published-call.repository';
import { PublishedCall } from 'telegram/shared/domain/entities/published-call.entity';
import { NormalizedAddress } from 'token/identity/normalized-address.vo';
import { TrackedPublishedCall } from '../../domain/entities/tracked-published-call.entity';

/**
 * Preservation Property Tests
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**
 *
 * **Property 2: Preservation** - EVM Normalization and Valid mcAtCall Handling
 *
 * These tests capture the BASELINE behavior on UNFIXED code for non-buggy inputs.
 * They verify that fixing Bug 2 (Solana case preservation) does NOT break:
 * - EVM address normalization (lowercasing)
 * - Valid published call mcAtCall value handling
 * - TrackedPublishedCall entity validation
 * - Address reconstruction from database
 *
 * IMPORTANT: These tests should PASS on UNFIXED code and continue to PASS
 * after the fix is implemented, ensuring no regressions.
 *
 * The tests use property-based testing to generate many test cases automatically,
 * providing stronger guarantees than manual unit tests.
 */

// ============================================================================
// Test Stubs and Helpers
// ============================================================================

class StubTrackedRepo extends TrackedPublishedCallRepository {
  records = new Map<string, TrackedPublishedCallRecord>();

  async findByChainAndAddress(chain: string, address: string) {
    return this.records.get(`${chain}:${address.toLowerCase()}`) ?? null;
  }

  async findActive(limit: number) {
    return Array.from(this.records.values())
      .filter((r) => r.isActive)
      .slice(0, limit);
  }

  async findMany() {
    return [];
  }

  async save(record: TrackedPublishedCallRecord) {
    this.records.set(`${record.chain}:${record.address.toLowerCase()}`, {
      ...record,
    });
    return record;
  }
}

class StubPublishedRepo extends PublishedCallRepository {
  stored: PublishedCall | null = null;

  async save(call: PublishedCall) {
    this.stored = call;
  }

  async findByChainAndAddress() {
    return this.stored;
  }

  async findRecent() {
    return [];
  }

  async findPublished() {
    return [];
  }

  async findFailed() {
    return [];
  }

  async countPublished() {
    return 0;
  }
}

// ============================================================================
// Arbitrary Generators for Property-Based Testing
// ============================================================================

/**
 * Generate valid EVM addresses with mixed case
 */
const evmAddressArb = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
    minLength: 40,
    maxLength: 40,
  })
  .map((hex) => {
    // Mix case randomly for each character
    return `0x${hex
      .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
      .join('')}`;
  });

/**
 * Generate valid mcAtCall values (non-negative finite numbers)
 */
const mcAtCallArb = fc.oneof(
  fc.constant(0),
  fc.integer({ min: 1, max: 1_000_000_000 }),
  fc.double({ min: 0.01, max: 1_000_000_000, noNaN: true }),
);

/**
 * Generate chain identifiers (EVM chains)
 */
const evmChainArb = fc.constantFrom('ethereum', 'base', 'arbitrum', 'polygon');

/**
 * Generate ticker symbols (3-5 uppercase letters or null)
 */
const tickerArb = fc.oneof(
  fc.constant(null),
  fc
    .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
      minLength: 3,
      maxLength: 5,
    })
    .map((arr) => arr.join('')),
);

/**
 * Generate kolId strings
 */
const kolIdArb = fc.oneof(
  fc.constant('unknown'),
  fc
    .array(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-'.split('')),
      {
        minLength: 5,
        maxLength: 20,
      },
    )
    .map((arr) => `kol_${arr.join('')}`),
);

/**
 * Generate dates in the past year
 */
const recentDateArb = fc.date({
  min: new Date('2026-01-01'),
  max: new Date('2026-12-31'),
});

// ============================================================================
// Property 2: Preservation - EVM Normalization
// ============================================================================

describe('NormalizedAddress - Preservation: EVM Address Normalization', () => {
  /**
   * Property 2.1: EVM addresses are lowercased during normalization
   * **Validates: Requirements 3.4**
   *
   * EXPECTED OUTCOME on UNFIXED code: PASS
   * EXPECTED OUTCOME on FIXED code: PASS (unchanged behavior)
   */
  it('Property 2.1: Preservation - fromEvm() lowercases all valid mixed-case EVM addresses', () => {
    fc.assert(
      fc.property(evmAddressArb, (mixedCaseAddress) => {
        const normalized = NormalizedAddress.fromEvm(mixedCaseAddress);

        // Assert: EVM addresses should be lowercased
        expect(normalized.value).toBe(mixedCaseAddress.toLowerCase());
        expect(normalized.chain.value).toBe('evm');
      }),
      { numRuns: 100 }, // Run 100 property test cases
    );
  });

  /**
   * Property 2.2: EVM addresses with different cases are structurally equal
   * **Validates: Requirements 3.6**
   *
   * EXPECTED OUTCOME on UNFIXED code: PASS
   * EXPECTED OUTCOME on FIXED code: PASS (unchanged behavior)
   */
  it('Property 2.2: Preservation - EVM addresses with different cases are structurally equal', () => {
    fc.assert(
      fc.property(evmAddressArb, (mixedCaseAddress) => {
        const normalized1 = NormalizedAddress.fromEvm(mixedCaseAddress);
        const normalized2 = NormalizedAddress.fromEvm(
          mixedCaseAddress.toLowerCase(),
        );
        const normalized3 = NormalizedAddress.fromEvm(
          mixedCaseAddress.toUpperCase(),
        );

        // Assert: All three should be structurally equal
        expect(normalized1.equals(normalized2)).toBe(true);
        expect(normalized1.equals(normalized3)).toBe(true);
        expect(normalized2.equals(normalized3)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Property 2.3: EVM addresses can be reconstructed from database
   * **Validates: Requirements 3.7**
   *
   * EXPECTED OUTCOME on UNFIXED code: PASS
   * EXPECTED OUTCOME on FIXED code: PASS (unchanged behavior)
   */
  it('Property 2.3: Preservation - EVM addresses can be reconstructed from stored values', () => {
    fc.assert(
      fc.property(evmAddressArb, (mixedCaseAddress) => {
        // Step 1: Normalize (simulates saving to database)
        const normalized = NormalizedAddress.fromEvm(mixedCaseAddress);
        const storedValue = normalized.value; // lowercase

        // Step 2: Reconstruct from stored value (simulates reading from database)
        // Use 'evm' as chain hint (not 'ethereum')
        const reconstructed = NormalizedAddress.fromChainHint(
          storedValue,
          'evm',
        );

        // Assert: Reconstruction should succeed
        expect(reconstructed).not.toBeNull();
        expect(reconstructed?.value).toBe(mixedCaseAddress.toLowerCase());
        expect(reconstructed?.chain.value).toBe('evm');

        // Assert: Original and reconstructed should be structurally equal
        expect(normalized.equals(reconstructed)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * Property 2.4: Invalid EVM addresses throw DomainError
   * **Validates: Requirements 3.5, 3.9**
   *
   * EXPECTED OUTCOME on UNFIXED code: PASS
   * EXPECTED OUTCOME on FIXED code: PASS (unchanged behavior)
   */
  it('Property 2.4: Preservation - Invalid EVM addresses throw DomainError', () => {
    const invalidAddresses = [
      '0xabc', // too short
      '0x' + 'g'.repeat(40), // invalid hex character
      'abc123', // missing 0x prefix
      '0x' + 'a'.repeat(39), // 39 hex chars (need 40)
      '0x' + 'a'.repeat(41), // 41 hex chars (need 40)
    ];

    invalidAddresses.forEach((invalidAddress) => {
      expect(() => {
        NormalizedAddress.fromEvm(invalidAddress);
      }).toThrow('Invalid EVM address');
    });
  });
});

// ============================================================================
// Property 2: Preservation - Valid mcAtCall Handling
// ============================================================================

describe('TrackPublishedCallUseCase - Preservation: Valid mcAtCall Handling', () => {
  /**
   * Property 2.5: Valid mcAtCall values are used as mcAtPublish
   * **Validates: Requirements 3.1**
   *
   * EXPECTED OUTCOME on UNFIXED code: PASS
   * EXPECTED OUTCOME on FIXED code: PASS (unchanged behavior)
   */
  it('Property 2.5: Preservation - Valid mcAtCall from published call is used as mcAtPublish', async () => {
    await fc.assert(
      fc.asyncProperty(
        evmChainArb,
        evmAddressArb,
        mcAtCallArb,
        tickerArb,
        kolIdArb,
        recentDateArb,
        async (chain, address, mcAtCall, ticker, kolId, publishedAt) => {
          // Arrange
          const trackedRepo = new StubTrackedRepo();
          const publishedRepo = new StubPublishedRepo();

          // Mock published call with valid mcAtCall
          publishedRepo.stored = {
            mcAtCall,
            publishedChannelIds: [],
          } as any;

          const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

          // Act
          const result = await uc.execute({
            chain,
            address,
            ticker,
            publishedAt,
            kolId,
          });

          // Assert: mcAtPublish should equal mcAtCall
          expect(result.created).toBe(true);

          const stored = await trackedRepo.findByChainAndAddress(
            chain,
            address,
          );
          expect(stored).not.toBeNull();
          expect(stored?.mcAtPublish).toBe(mcAtCall);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Property 2.6: Null mcAtCall defaults to 0
   * **Validates: Requirements 3.1, 3.2**
   *
   * EXPECTED OUTCOME on UNFIXED code: PASS
   * EXPECTED OUTCOME on FIXED code: PASS (unchanged behavior)
   */
  it('Property 2.6: Preservation - Null mcAtCall defaults to 0 (published call exists)', async () => {
    await fc.assert(
      fc.asyncProperty(
        evmChainArb,
        evmAddressArb,
        tickerArb,
        kolIdArb,
        recentDateArb,
        async (chain, address, ticker, kolId, publishedAt) => {
          // Arrange
          const trackedRepo = new StubTrackedRepo();
          const publishedRepo = new StubPublishedRepo();

          // Mock published call with null mcAtCall
          publishedRepo.stored = {
            mcAtCall: null,
            publishedChannelIds: [],
          } as any;

          const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

          // Act
          const result = await uc.execute({
            chain,
            address,
            ticker,
            publishedAt,
            kolId,
          });

          // Assert: mcAtPublish should default to 0
          expect(result.created).toBe(true);

          const stored = await trackedRepo.findByChainAndAddress(
            chain,
            address,
          );
          expect(stored).not.toBeNull();
          expect(stored?.mcAtPublish).toBe(0);
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * Property 2.7: kolId fallback logic continues to work
   * **Validates: Requirements 3.3**
   *
   * EXPECTED OUTCOME on UNFIXED code: PASS
   * EXPECTED OUTCOME on FIXED code: PASS (unchanged behavior)
   */
  it('Property 2.7: Preservation - kolId fallback to published.publishedChannelIds[0]', async () => {
    await fc.assert(
      fc.asyncProperty(
        evmChainArb,
        evmAddressArb,
        mcAtCallArb,
        tickerArb,
        recentDateArb,
        async (chain, address, mcAtCall, ticker, publishedAt) => {
          // Arrange
          const trackedRepo = new StubTrackedRepo();
          const publishedRepo = new StubPublishedRepo();

          const expectedKolId = 'channel_123';
          publishedRepo.stored = {
            mcAtCall,
            publishedChannelIds: [expectedKolId, 'channel_456'],
          } as any;

          const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

          // Act: No kolId provided in input
          const result = await uc.execute({
            chain,
            address,
            ticker,
            publishedAt,
            // kolId not provided
          });

          // Assert: kolId should fall back to first publishedChannelId
          expect(result.created).toBe(true);

          const stored = await trackedRepo.findByChainAndAddress(
            chain,
            address,
          );
          expect(stored).not.toBeNull();
          expect(stored?.kolId).toBe(expectedKolId);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('Property 2.7: Preservation - kolId fallback to "unknown" when no sources available', async () => {
    await fc.assert(
      fc.asyncProperty(
        evmChainArb,
        evmAddressArb,
        tickerArb,
        recentDateArb,
        async (chain, address, ticker, publishedAt) => {
          // Arrange
          const trackedRepo = new StubTrackedRepo();
          const publishedRepo = new StubPublishedRepo();

          // No published call (null) and no kolId in input
          publishedRepo.stored = null;

          const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

          // Act
          const result = await uc.execute({
            chain,
            address,
            ticker,
            publishedAt,
            // kolId not provided
          });

          // Assert: kolId should default to 'unknown'
          expect(result.created).toBe(true);

          const stored = await trackedRepo.findByChainAndAddress(
            chain,
            address,
          );
          expect(stored).not.toBeNull();
          expect(stored?.kolId).toBe('unknown');
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ============================================================================
// Property 2: Preservation - TrackedPublishedCall Validation
// ============================================================================

describe('TrackedPublishedCall - Preservation: Validation Logic', () => {
  /**
   * Property 2.8: Valid mcAtPublish values are accepted
   * **Validates: Requirements 3.2**
   *
   * EXPECTED OUTCOME on UNFIXED code: PASS
   * EXPECTED OUTCOME on FIXED code: PASS (unchanged behavior)
   */
  it('Property 2.8: Preservation - TrackedPublishedCall.create() accepts valid mcAtPublish values', () => {
    fc.assert(
      fc.property(
        evmChainArb,
        evmAddressArb,
        mcAtCallArb,
        tickerArb,
        kolIdArb,
        recentDateArb,
        (chain, address, mcAtPublish, ticker, kolId, publishedAt) => {
          // Act & Assert: Should not throw
          const tracked = TrackedPublishedCall.create({
            chain,
            address,
            ticker,
            mcAtPublish,
            kolId,
            publishedAt,
          });

          expect(tracked.mcAtPublish).toBe(mcAtPublish);
          expect(tracked.chain).toBe(chain);
          expect(tracked.address).toBe(address.toLowerCase());
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 2.9: Negative mcAtPublish values are rejected
   * **Validates: Requirements 3.2**
   *
   * EXPECTED OUTCOME on UNFIXED code: PASS
   * EXPECTED OUTCOME on FIXED code: PASS (unchanged behavior)
   */
  it('Property 2.9: Preservation - TrackedPublishedCall.create() rejects negative mcAtPublish', () => {
    const negativeMcArb = fc.oneof(
      fc.integer({ min: -1_000_000, max: -1 }),
      fc.double({ min: -1_000_000, max: -0.01, noNaN: true }),
    );

    fc.assert(
      fc.property(
        evmChainArb,
        evmAddressArb,
        negativeMcArb,
        tickerArb,
        kolIdArb,
        recentDateArb,
        (chain, address, mcAtPublish, ticker, kolId, publishedAt) => {
          // Act & Assert: Should throw validation error
          expect(() => {
            TrackedPublishedCall.create({
              chain,
              address,
              ticker,
              mcAtPublish,
              kolId,
              publishedAt,
            });
          }).toThrow('mcAtPublish must be a non-negative finite number');
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * Property 2.10: Non-finite mcAtPublish values are rejected
   * **Validates: Requirements 3.2**
   *
   * EXPECTED OUTCOME on UNFIXED code: PASS
   * EXPECTED OUTCOME on FIXED code: PASS (unchanged behavior)
   */
  it('Property 2.10: Preservation - TrackedPublishedCall.create() rejects NaN and Infinity', () => {
    const nonFiniteValues = [NaN, Infinity, -Infinity];

    nonFiniteValues.forEach((mcAtPublish) => {
      expect(() => {
        TrackedPublishedCall.create({
          chain: 'ethereum',
          address: '0xabc1234567890123456789012345678901234567',
          ticker: 'TEST',
          mcAtPublish,
          kolId: 'kol_test',
          publishedAt: new Date(),
        });
      }).toThrow('mcAtPublish must be a non-negative finite number');
    });
  });
});
