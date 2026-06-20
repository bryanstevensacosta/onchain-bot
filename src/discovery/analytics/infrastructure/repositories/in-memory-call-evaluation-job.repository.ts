import { Injectable } from '@nestjs/common';
import { CallEvaluationJob } from 'discovery/analytics/domain/entities/call-evaluation-job.entity';
import { CallEvaluationJobRepository } from 'discovery/analytics/application/ports/call-evaluation-job.repository';

@Injectable()
export class InMemoryCallEvaluationJobRepository extends CallEvaluationJobRepository {
  private static readonly MAX_ENTRIES = 50_000;
  private readonly store = new Map<string, CallEvaluationJob>();

  public async save(job: CallEvaluationJob): Promise<void> {
    await Promise.resolve();
    this.store.set(job.id, job);
    while (this.store.size > InMemoryCallEvaluationJobRepository.MAX_ENTRIES) {
      const oldest: string | undefined = this.store.keys().next().value as
        | string
        | undefined;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  public async findById(id: string): Promise<CallEvaluationJob | null> {
    await Promise.resolve();
    return this.store.get(id) ?? null;
  }

  public async findDue(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<CallEvaluationJob>> {
    await Promise.resolve();
    const nowMs = now.getTime();
    return Array.from(this.store.values())
      .filter((j) => j.status === 'PENDING' && j.scheduledAt.getTime() <= nowMs)
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, limit);
  }

  public async findPendingForCall(
    channelId: string,
    chain: string,
    address: string,
    callTimestamp: Date,
  ): Promise<ReadonlyArray<CallEvaluationJob>> {
    await Promise.resolve();
    const ch = channelId.toLowerCase();
    const addr = address.toLowerCase();
    return Array.from(this.store.values()).filter(
      (j) =>
        j.channelId.toLowerCase() === ch &&
        j.chain.value === chain &&
        j.address === addr &&
        j.callTimestamp.getTime() === callTimestamp.getTime() &&
        j.status !== 'COMPLETED',
    );
  }

  public async count(): Promise<number> {
    await Promise.resolve();
    return this.store.size;
  }
}
