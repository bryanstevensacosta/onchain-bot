import { Injectable } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import { TokenClassification } from 'token/classification/domain/entities/token-classification.entity';
import { TokenClassificationRepository } from 'token/classification/application/ports/token-classification.repository';

@Injectable()
export class InMemoryTokenClassificationRepository extends TokenClassificationRepository {
  private static readonly MAX_ENTRIES = 500;
  private readonly store = new Map<string, TokenClassification>();

  public async save(c: TokenClassification): Promise<void> {
    await Promise.resolve();
    this.store.set(c.id, c);
    while (
      this.store.size > InMemoryTokenClassificationRepository.MAX_ENTRIES
    ) {
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
  ): Promise<TokenClassification | null> {
    await Promise.resolve();
    return this.store.get(`${chain.value}:${address.toLowerCase()}`) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<TokenClassification>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .sort((a, b) => b.classifiedAt.getTime() - a.classifiedAt.getTime())
      .slice(0, limit);
  }
}
