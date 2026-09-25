import { Injectable } from '@nestjs/common';
import type { Thread } from '../../domain/entities/thread.entity';
import type { ThreadMessage } from '../../domain/entities/thread-message.entity';

const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30000;

/**
 * ThreadSchedulerService: timing + sequencing (spec §9
 * `thread-scheduler.service.ts`).
 *
 * Pure: message due times derive from `thread.createdAt` plus the
 * cumulative per-message `delaySeconds` (message 0 is due at
 * creation). Backoff mirrors the house shape (1s doubling, 30s cap).
 */
@Injectable()
export class ThreadSchedulerService {
  public dueMessages(thread: Thread, now: Date): ThreadMessage[] {
    const messages = thread.messages;
    const due: ThreadMessage[] = [];
    let cursor = thread.createdAt.getTime();
    for (const message of messages) {
      cursor += message.delaySeconds * 1000;
      if (now.getTime() < cursor) {
        break;
      }
      due.push(message);
    }
    return due;
  }

  public nextMessageDueAt(thread: Thread, now: Date): Date | null {
    void now;
    const messages = thread.messages;
    let cursor = thread.createdAt.getTime();
    for (let index = 0; index < messages.length; index += 1) {
      cursor += messages[index].delaySeconds * 1000;
      if (index >= thread.messagesPublished) {
        return new Date(cursor);
      }
    }
    return null;
  }

  public isAttemptDue(thread: Thread, now: Date): boolean {
    return thread.isDue(now);
  }

  public computeBackoffMs(attempts: number): number {
    const safe = Number.isFinite(attempts) && attempts > 0 ? attempts : 0;
    return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** safe);
  }
}
