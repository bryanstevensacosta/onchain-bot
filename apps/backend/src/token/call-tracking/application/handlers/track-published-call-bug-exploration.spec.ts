import { TrackPublishedCallUseCase } from './track-published-call.use-case';
import {
  TrackedPublishedCallRepository,
  TrackedPublishedCallRecord,
} from '../ports/tracked-published-call.repository';
import { PublishedCallRepository } from 'telegram/shared/application/ports/published-call.repository';
import { PublishedCall } from 'telegram/shared/domain/entities/published-call.entity';
import { NormalizedAddress } from 'token/identity/normalized-address.vo';

/**
 * Bug Condition Exploration Tests
 *
 * **Property 1: Bug Condition** - mcAtPublish Defaults and Solana Case Preservation
 *
 * **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bugs exist
 * **DO NOT attempt to fix the tests or the code when they fail**
 * **NOTE**: These tests encode the expected behavior - they will validate the fixes when they pass after implementation
 * **GOAL**: Surface counterexamples that demonstrate the bugs exist
 * **Scoped PBT Approach**: Test concrete failing cases to ensure reproducibility
 *
 * **Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 1.7**
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
// Bug 1: mcAtPublish Validation Failure
// ============================================================================

describe('TrackPublishedCallUseCase - Bug 1: mcAtPublish Defaults', () => {
  /**
   * Test Case: Null Published Call on EVM Chain
   *
   * EXPECTED OUTCOME on UNFIXED code:
   * - Test FAILS with "mcAtPublish must be a non-negative finite number"
   *
   * EXPECTED OUTCOME on FIXED code:
   * - Test PASSES
   * - Tracked call created with mcAtPublish=0
   *
   * **Validates: Requirements 1.1, 1.3**
   */
  it('Property 1: Bug Condition - EVM: should default mcAtPublish to 0 when published call not found', async () => {
    const trackedRepo = new StubTrackedRepo();
    const publishedRepo = new StubPublishedRepo();
    publishedRepo.stored = null; // Simulate null return
    const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

    const result = await uc.execute({
      chain: 'ethereum',
      address: '0x2d61bbbe5ad9a8f18fef35940301fd24f143a72b',
      ticker: 'TEST',
      publishedAt: new Date('2026-06-24T10:00:00Z'),
      kolId: 'kol_test',
    });

    // Assert expected behavior (after fix)
    expect(result.created).toBe(true);
    expect(result.trackedId).toBe(
      'ethereum:0x2d61bbbe5ad9a8f18fef35940301fd24f143a72b',
    );

    const stored = await trackedRepo.findByChainAndAddress(
      'ethereum',
      '0x2d61bbbe5ad9a8f18fef35940301fd24f143a72b',
    );
    expect(stored).not.toBeNull();
    expect(stored?.mcAtPublish).toBe(0);
    expect(stored?.kolId).toBe('kol_test');
  });

  /**
   * Test Case: Null Published Call on Solana Chain
   *
   * EXPECTED OUTCOME on UNFIXED code:
   * - Test FAILS with "mcAtPublish must be a non-negative finite number"
   *
   * EXPECTED OUTCOME on FIXED code:
   * - Test PASSES
   * - Tracked call created with mcAtPublish=0
   *
   * **Validates: Requirements 1.1, 1.3**
   */
  it('Property 1: Bug Condition - Solana: should default mcAtPublish to 0 when published call not found', async () => {
    const trackedRepo = new StubTrackedRepo();
    const publishedRepo = new StubPublishedRepo();
    publishedRepo.stored = null; // Simulate null return
    const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

    const result = await uc.execute({
      chain: 'solana',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ticker: 'USDC',
      publishedAt: new Date('2026-06-24T10:00:00Z'),
      kolId: 'kol_test',
    });

    // Assert expected behavior (after fix)
    expect(result.created).toBe(true);
    const stored = await trackedRepo.findByChainAndAddress(
      'solana',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    expect(stored).not.toBeNull();
    expect(stored?.mcAtPublish).toBe(0);
    expect(stored?.kolId).toBe('kol_test');
  });

  /**
   * Test Case: Null Published Call with Unknown KOL
   *
   * EXPECTED OUTCOME on UNFIXED code:
   * - Test FAILS with "mcAtPublish must be a non-negative finite number"
   *
   * EXPECTED OUTCOME on FIXED code:
   * - Test PASSES
   * - Tracked call created with mcAtPublish=0 and kolId='unknown'
   *
   * **Validates: Requirements 1.1, 1.3**
   */
  it('Property 1: Bug Condition - should default mcAtPublish to 0 and kolId to unknown when both are unavailable', async () => {
    const trackedRepo = new StubTrackedRepo();
    const publishedRepo = new StubPublishedRepo();
    publishedRepo.stored = null; // Simulate null return
    const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

    const result = await uc.execute({
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      ticker: null,
      publishedAt: new Date('2026-06-24T10:00:00Z'),
      // No kolId provided
    });

    // Assert expected behavior (after fix)
    expect(result.created).toBe(true);
    const stored = await trackedRepo.findByChainAndAddress(
      'solana',
      'So11111111111111111111111111111111111111112',
    );
    expect(stored).not.toBeNull();
    expect(stored?.mcAtPublish).toBe(0);
    expect(stored?.kolId).toBe('unknown');
  });
});

// ============================================================================
// Bug 2: Invalid Solana Address Normalization
// ============================================================================

describe('NormalizedAddress - Bug 2: Solana Address Case Preservation', () => {
  /**
   * Test Case: Mixed-Case Solana Address Normalization
   *
   * EXPECTED OUTCOME on UNFIXED code:
   * - fromSolana() LOWERCASES the address (stored value is lowercase)
   * - Test FAILS at the assertion expecting case preservation
   * - This documents the bug: address corruption through lowercasing
   *
   * EXPECTED OUTCOME on FIXED code:
   * - fromSolana() preserves the original case
   * - Test PASSES
   *
   * **Validates: Requirements 1.4, 1.5**
   */
  it('Property 2: Bug Condition - should preserve original case when normalizing Solana address', () => {
    const mixedCaseAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const normalized = NormalizedAddress.fromSolana(mixedCaseAddress);

    // Assert expected behavior (after fix): case is preserved
    // On UNFIXED code: this will FAIL because value is lowercased
    expect(normalized.value).toBe(mixedCaseAddress);
    expect(normalized.value).not.toBe(mixedCaseAddress.toLowerCase());
  });

  /**
   * Test Case: Solana Address Reconstruction After Storage
   *
   * EXPECTED OUTCOME on UNFIXED code:
   * - fromSolana() lowercases the address
   * - Stored value is 'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v'
   * - fromChainHint() attempts to reconstruct with lowercase value
   * - Base58 validation FAILS with "Invalid Solana address"
   * - Test FAILS, documenting the bug
   *
   * EXPECTED OUTCOME on FIXED code:
   * - fromSolana() preserves case
   * - Stored value is 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
   * - fromChainHint() successfully reconstructs
   * - Test PASSES
   *
   * **Validates: Requirements 1.4, 1.5, 1.6, 1.7**
   */
  it('Property 2: Bug Condition - should reconstruct Solana address from stored value', () => {
    const originalAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    // Step 1: Normalize the address (simulates saving to database)
    const normalized = NormalizedAddress.fromSolana(originalAddress);
    const storedValue = normalized.value;

    // Step 2: Reconstruct from stored value (simulates reading from database)
    // On UNFIXED code: storedValue is lowercase, reconstruction will fail
    const reconstructed = NormalizedAddress.fromChainHint(
      storedValue,
      'solana',
    );

    // Assert expected behavior (after fix)
    expect(reconstructed).not.toBeNull();
    expect(reconstructed?.value).toBe(originalAddress);
    expect(reconstructed?.chain.value).toBe('solana');
  });

  /**
   * Test Case: Lowercase Solana Address Validation
   *
   * This test checks if a lowercase Base58 string is valid.
   * Most Base58 addresses with uppercase will become invalid when lowercased.
   *
   * EXPECTED OUTCOME on UNFIXED code:
   * - The lowercased address likely FAILS Base58 validation
   * - fromSolana() throws DomainError with "Invalid Solana address"
   * - This demonstrates that lowercasing corrupts the address
   *
   * EXPECTED OUTCOME on FIXED code:
   * - fromSolana() is never called with a corrupted lowercase address
   * - Original case-sensitive addresses are validated correctly
   *
   * **Validates: Requirements 1.4, 1.5**
   */
  it('Property 2: Bug Condition - demonstrates lowercased Solana address fails validation', () => {
    const originalAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const lowercasedAddress = originalAddress.toLowerCase();

    // On UNFIXED code: if we try to validate the lowercased address directly,
    // it should fail because lowercase corrupts the Base58 encoding
    expect(() => {
      NormalizedAddress.fromSolana(lowercasedAddress);
    }).toThrow('Invalid Solana address');
  });

  /**
   * Test Case: Multiple Different Solana Addresses
   *
   * Tests that different valid Solana addresses are all case-preserved
   *
   * EXPECTED OUTCOME on UNFIXED code:
   * - All addresses are lowercased
   * - Tests FAIL at case preservation assertions
   *
   * EXPECTED OUTCOME on FIXED code:
   * - All addresses preserve their original case
   * - Tests PASS
   *
   * **Validates: Requirements 1.4, 1.5**
   */
  it('Property 2: Bug Condition - should preserve case for various Solana addresses', () => {
    const testAddresses = [
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'So11111111111111111111111111111111111111112', // Wrapped SOL
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ];

    testAddresses.forEach((address) => {
      const normalized = NormalizedAddress.fromSolana(address);

      // Assert expected behavior (after fix): original case is preserved
      // On UNFIXED code: this will FAIL for all addresses
      expect(normalized.value).toBe(address);
      expect(normalized.value).not.toBe(address.toLowerCase());
    });
  });
});
