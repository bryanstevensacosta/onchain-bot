import { Injectable } from '@nestjs/common';
import { ChainDetectionResult } from 'chain/detection/domain/entities/chain-detection-result.entity';
import { ChainDetectionRepository } from 'chain/detection/application/ports/chain-detection.repository';

@Injectable()
export class InMemoryChainDetectionRepository extends ChainDetectionRepository {
  private static readonly MAX_ENTRIES = 1000;
  private readonly store = new Map<string, ChainDetectionResult>();

  public async save(result: ChainDetectionResult): Promise<void> {
    await Promise.resolve();
    this.store.set(result.id, result);
    while (this.store.size > InMemoryChainDetectionRepository.MAX_ENTRIES) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findByAddress(
    address: string,
  ): Promise<ChainDetectionResult | null> {
    await Promise.resolve();
    return this.store.get(address.toLowerCase()) ?? null;
  }

  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<ChainDetectionResult>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
      .slice(0, limit);
  }
}
