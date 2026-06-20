import { Injectable } from '@nestjs/common';
import { CallPerformance } from 'discovery/analytics/domain/value-objects/call-performance.vo';
import { CallPerformanceRepository } from 'discovery/analytics/application/ports/call-performance.repository';

@Injectable()
export class InMemoryCallPerformanceRepository extends CallPerformanceRepository {
  private static readonly MAX_ENTRIES = 10_000;
  // Composite key: `${channelId}:${tokenId}`
  private readonly store = new Map<string, CallPerformance>();

  public async save(perf: CallPerformance): Promise<void> {
    await Promise.resolve();
    this.store.set(`${perf.channelId}:${perf.tokenId}`, perf);
    while (this.store.size > InMemoryCallPerformanceRepository.MAX_ENTRIES) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findByChannel(
    channelId: string,
  ): Promise<ReadonlyArray<CallPerformance>> {
    await Promise.resolve();
    return Array.from(this.store.values()).filter(
      (p) => p.channelId === channelId,
    );
  }

  public async findByToken(
    tokenId: string,
  ): Promise<ReadonlyArray<CallPerformance>> {
    await Promise.resolve();
    return Array.from(this.store.values()).filter((p) => p.tokenId === tokenId);
  }

  public async findAll(): Promise<ReadonlyArray<CallPerformance>> {
    await Promise.resolve();
    return Array.from(this.store.values());
  }
}
