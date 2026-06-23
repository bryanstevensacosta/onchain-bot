import { Injectable } from '@nestjs/common';
import { CallPerformance } from 'token/call-tracking/domain/value-objects/call-performance.vo';
import { CallPerformanceRepository } from 'token/call-tracking/application/ports/call-performance.repository';

@Injectable()
export class InMemoryCallPerformanceRepository extends CallPerformanceRepository {
  private static readonly MAX_ENTRIES = 10_000;
  // Composite key: `${kolId}:${tokenId}`
  private readonly store = new Map<string, CallPerformance>();

  public async save(perf: CallPerformance): Promise<void> {
    await Promise.resolve();
    this.store.set(`${perf.kolId}:${perf.tokenId}`, perf);
    while (this.store.size > InMemoryCallPerformanceRepository.MAX_ENTRIES) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findByChannel(
    kolId: string,
  ): Promise<ReadonlyArray<CallPerformance>> {
    await Promise.resolve();
    return Array.from(this.store.values()).filter((p) => p.kolId === kolId);
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
