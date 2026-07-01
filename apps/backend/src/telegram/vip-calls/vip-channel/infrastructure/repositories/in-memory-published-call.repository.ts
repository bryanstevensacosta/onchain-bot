import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall, PublishedCallRepository } from 'telegram/shared';

@Injectable()
export class InMemoryPublishedCallRepository implements PublishedCallRepository {
  private readonly store = new Map<string, PublishedCall>();
  private static readonly MAX_ENTRIES = 500;

  public async save(call: PublishedCall): Promise<void> {
    if (this.store.size >= InMemoryPublishedCallRepository.MAX_ENTRIES) {
      const oldestKey: string | undefined = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(call.id, call);
  }

  public async findByChainAndAddress(
    chain: ChainId,
    address: string,
  ): Promise<PublishedCall | null> {
    const normalizedAddress = chain.isSolana ? address : address.toLowerCase();
    const key = `${chain.value}:${normalizedAddress}`;
    return this.store.get(key) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    return Array.from(this.store.values())
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }

  public async findPublished(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    return Array.from(this.store.values())
      .filter((c) => c.isPublished)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }

  public async findFailed(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    return Array.from(this.store.values())
      .filter((c) => c.isFailed)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }

  public async countPublished(): Promise<number> {
    return Array.from(this.store.values()).filter((c) => c.isPublished).length;
  }
}
