import { Injectable } from '@nestjs/common';
import { Thread } from '../../domain/entities/thread.entity';
import type { ThreadMessageInput } from '../../domain/entities/thread-message.entity';
import { ThreadRepository } from '../../domain/ports/thread.repository';

/**
 * CreateThreadUseCase (spec §9 `create-thread.use-case.ts`).
 *
 * Builds a DRAFT Thread via `Thread.create` (invariants enforced
 * there) and persists it. Publishing starts only after an explicit
 * enqueue (v2 endpoint; the v1 controller answers 501).
 */
@Injectable()
export class CreateThreadUseCase {
  public constructor(private readonly threads: ThreadRepository) {}

  public async execute(input: {
    readonly messages: ThreadMessageInput[];
  }): Promise<{ thread: Thread }> {
    const thread = Thread.create({ messages: input.messages });
    await this.threads.save(thread);
    return { thread };
  }
}
