import { Injectable } from '@nestjs/common';
import { Thread, type ThreadSnapshot } from '../../domain/entities/thread.entity';
import type { ThreadMessageInput } from '../../domain/entities/thread-message.entity';

/**
 * ThreadBuilderService: skeleton orchestrator (spec §9
 * `thread-builder.service.ts`).
 *
 * Validates + builds a DRAFT Thread from message inputs. Persistence
 * stays in CreateThreadUseCase (builder never touches a repository).
 */
@Injectable()
export class ThreadBuilderService {
  public build(messages: ThreadMessageInput[]): Thread {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('ThreadBuilderService requires at least one message');
    }
    return Thread.create({ messages });
  }

  public rebuild(snapshot: ThreadSnapshot): Thread {
    return Thread.rehydrate(snapshot);
  }
}
