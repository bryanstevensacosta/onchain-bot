import { Injectable } from '@nestjs/common';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import { HoneypotAnalysis } from 'ca/honeypot/domain/entities/honeypot-analysis.entity';
import { HoneypotAnalysisRepository } from 'ca/honeypot/application/ports/honeypot-analysis.repository';

@Injectable()
export class InMemoryHoneypotAnalysisRepository extends HoneypotAnalysisRepository {
  private static readonly MAX_ENTRIES = 500;
  private readonly store = new Map<string, HoneypotAnalysis>();

  public async save(analysis: HoneypotAnalysis): Promise<void> {
    await Promise.resolve();
    this.store.set(analysis.id, analysis);
    while (this.store.size > InMemoryHoneypotAnalysisRepository.MAX_ENTRIES) {
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
  ): Promise<HoneypotAnalysis | null> {
    await Promise.resolve();
    return this.store.get(`${chain.value}:${address.toLowerCase()}`) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<HoneypotAnalysis>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .sort((a, b) => b.analyzedAt.getTime() - a.analyzedAt.getTime())
      .slice(0, limit);
  }
}
