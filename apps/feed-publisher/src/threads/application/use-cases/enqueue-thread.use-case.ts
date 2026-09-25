import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { Thread } from '../../domain/entities/thread.entity';
import { ThreadRepository } from '../../domain/ports/thread.repository';

/**
 * EnqueueThreadUseCase (spec §9 `enqueue-thread.use-case.ts`).
 *
 * DRAFT -> QUEUED. The cron picks QUEUED threads up; anything else
 * (unknown id, non-DRAFT state) is rejected before any state change.
 */
@Injectable()
export class EnqueueThreadUseCase {
  public constructor(private readonly threads: ThreadRepository) {}

  public async execute(threadId: string): Promise<{ thread: Thread }> {
    const thread = await this.threads.findById(threadId);
    if (!thread) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Thread ${threadId} not found`,
      );
    }
    thread.enqueue();
    await this.threads.save(thread);
    return { thread };
  }
}
