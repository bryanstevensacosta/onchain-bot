import { Injectable } from '@nestjs/common';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { TokenSnapshot } from 'discovery/enrichment/domain/entities/token-snapshot.entity';
import { TokenSnapshotRepository } from 'discovery/enrichment/application/ports/token-snapshot.repository';

@Injectable()
export class InMemoryTokenSnapshotRepository extends TokenSnapshotRepository {
  private static readonly MAX_ENTRIES = 500;
  private readonly store = new Map<string, TokenSnapshot>();

  public async save(snapshot: TokenSnapshot): Promise<void> {
    await Promise.resolve();
    this.store.set(snapshot.id, snapshot);
    while (this.store.size > InMemoryTokenSnapshotRepository.MAX_ENTRIES) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<TokenSnapshot | null> {
    await Promise.resolve();
    return this.store.get(`${chain.value}:${address.toLowerCase()}`) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<TokenSnapshot>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .sort((a, b) => b.enrichedAt.getTime() - a.enrichedAt.getTime())
      .slice(0, limit);
  }
}
