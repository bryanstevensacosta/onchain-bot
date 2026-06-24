import { Injectable, Logger } from '@nestjs/common';
import {
  ReprocessRejectedTokenUseCase,
  ReprocessResultView,
} from './reprocess-rejected-token.use-case';

export interface ReprocessBatchInput {
  readonly addresses: ReadonlyArray<{ chain: string; address: string }>;
  readonly concurrency: number;
  readonly delayMs: number;
}

@Injectable()
export class ReprocessRejectedBatchUseCase {
  private readonly logger = new Logger(ReprocessRejectedBatchUseCase.name);

  public constructor(private readonly single: ReprocessRejectedTokenUseCase) {}

  public async execute(
    input: ReprocessBatchInput,
  ): Promise<ReadonlyArray<ReprocessResultView>> {
    const concurrency = Math.max(
      1,
      Math.min(20, Math.floor(input.concurrency) || 5),
    );
    const delayMs = Math.max(0, Math.min(5000, Math.floor(input.delayMs) || 0));
    const queue = [...input.addresses];
    const results: ReprocessResultView[] = [];

    const workers: Array<Promise<void>> = [];
    for (let w = 0; w < concurrency; w++) {
      workers.push(this.worker(w, queue, results, delayMs));
    }
    await Promise.all(workers);

    return results;
  }

  private async worker(
    workerId: number,
    queue: Array<{ chain: string; address: string }>,
    results: ReprocessResultView[],
    delayMs: number,
  ): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      try {
        const result = await this.single.execute(next);
        results.push(result);
      } catch (err) {
        this.logger.error(
          `Worker ${workerId} failed for ${next.chain}:${next.address}: ${(err as Error).message}`,
        );
        results.push({
          status: 'ERROR',
          chain: next.chain,
          address: next.address,
          error: (err as Error).message,
        });
      }
      if (delayMs > 0 && queue.length > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
}
