import { Injectable } from '@nestjs/common';
import { ThreadRepository } from '../domain/ports/thread.repository';

/**
 * P21 hook point: threads depth health (never liveness). Up when the
 * thread store reads; down when it throws. Provided + exported,
 * unwired until the composite health probe (same as every module).
 */
@Injectable()
export class ThreadsHealthIndicator {
  public constructor(private readonly threads: ThreadRepository) {}

  public async check(): Promise<{
    readonly component: string;
    readonly status: 'up' | 'down';
  }> {
    try {
      await this.threads.count();
      return { component: 'threads', status: 'up' };
    } catch {
      return { component: 'threads', status: 'down' };
    }
  }
}
