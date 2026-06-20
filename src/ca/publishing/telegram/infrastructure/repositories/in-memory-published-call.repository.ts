import { Injectable } from '@nestjs/common';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { PublishedCall } from 'ca/publishing/telegram/domain/entities/published-call.entity';
import { PublishedCallRepository } from 'ca/publishing/telegram/application/ports/published-call.repository';

@Injectable()
export class InMemoryPublishedCallRepository extends PublishedCallRepository {
  private static readonly MAX_ENTRIES = 500;
  private readonly store = new Map<string, PublishedCall>();

  public async save(call: PublishedCall): Promise<void> {
    await Promise.resolve();
    this.store.set(call.id, call);
    while (this.store.size > InMemoryPublishedCallRepository.MAX_ENTRIES) {
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
  ): Promise<PublishedCall | null> {
    await Promise.resolve();
    return this.store.get(`${chain.value}:${address.toLowerCase()}`) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }

  public async findPublished(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((c) => c.isPublished)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }

  public async findFailed(
    limit: number,
  ): Promise<ReadonlyArray<PublishedCall>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((c) => c.isFailed)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }
}
