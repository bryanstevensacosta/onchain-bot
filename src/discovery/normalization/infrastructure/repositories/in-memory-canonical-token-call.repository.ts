import { Injectable } from '@nestjs/common';
import { CanonicalTokenCall } from 'discovery/normalization/domain/entities/canonical-token-call.entity';
import { Chain } from 'discovery/normalization/domain/value-objects/chain.vo';
import { NormalizedAddress } from 'discovery/normalization/domain/value-objects/normalized-address.vo';
import { CanonicalTokenCallRepository } from 'discovery/normalization/application/ports/canonical-token-call.repository';

/**
 * In-memory CanonicalTokenCall repository.
 *
 * Indexed by `chain:address` composite key for O(1) dedupe lookup.
 * Bounded capacity (FIFO eviction) prevents unbounded memory growth.
 * Replace with TypeORM/Prisma adapter for production.
 */
@Injectable()
export class InMemoryCanonicalTokenCallRepository extends CanonicalTokenCallRepository {
  private static readonly MAX_ENTRIES = 5000;
  private readonly store = new Map<string, CanonicalTokenCall>();

  public async save(call: CanonicalTokenCall): Promise<void> {
    await Promise.resolve();
    this.store.set(call.id, call);
    while (this.store.size > InMemoryCanonicalTokenCallRepository.MAX_ENTRIES) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findByIdentity(
    chain: Chain,
    address: NormalizedAddress,
  ): Promise<CanonicalTokenCall | null> {
    await Promise.resolve();
    return this.store.get(`${chain.value}:${address.value}`) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<CanonicalTokenCall>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .slice(0, limit);
  }
}
