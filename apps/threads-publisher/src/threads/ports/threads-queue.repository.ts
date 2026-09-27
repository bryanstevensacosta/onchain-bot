import { ThreadsQueueEntry } from '../domain/threads-queue-entry.entity';

export abstract class ThreadsQueueRepository {
  public abstract enqueue(entry: ThreadsQueueEntry): Promise<void>;
  public abstract findByChannelIdAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<ThreadsQueueEntry | null>;
  public abstract findNextPending(): Promise<ThreadsQueueEntry | null>;
  public abstract listPending(limit: number): Promise<ThreadsQueueEntry[]>;
  public abstract countPending(): Promise<number>;
  public abstract delete(id: string): Promise<void>;
  public abstract save(entry: ThreadsQueueEntry): Promise<void>;
}
