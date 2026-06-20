import { Injectable } from '@nestjs/common';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { TokenScore } from 'discovery/scoring/domain/entities/token-score.entity';
import { TokenScoreRepository } from 'discovery/scoring/application/ports/token-score.repository';

@Injectable()
export class InMemoryTokenScoreRepository extends TokenScoreRepository {
  private static readonly MAX_ENTRIES = 500;
  private readonly store = new Map<string, TokenScore>();

  public async save(score: TokenScore): Promise<void> {
    await Promise.resolve();
    this.store.set(score.id, score);
    while (this.store.size > InMemoryTokenScoreRepository.MAX_ENTRIES) {
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
  ): Promise<TokenScore | null> {
    await Promise.resolve();
    return this.store.get(`${chain.value}:${address.toLowerCase()}`) ?? null;
  }

  public async findRecent(limit: number): Promise<ReadonlyArray<TokenScore>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .sort((a, b) => b.scoredAt.getTime() - a.scoredAt.getTime())
      .slice(0, limit);
  }

  public async findTopScores(
    limit: number,
    minScore: number,
  ): Promise<ReadonlyArray<TokenScore>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((s) => s.score.value >= minScore)
      .sort((a, b) => b.score.value - a.score.value)
      .slice(0, limit);
  }
}
