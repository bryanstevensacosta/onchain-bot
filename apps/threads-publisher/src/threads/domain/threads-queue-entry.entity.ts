export type ThreadsQueueStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'BLOCKED';

export const VALID_THREADS_TRANSITIONS: Record<
  ThreadsQueueStatus,
  readonly ThreadsQueueStatus[]
> = {
  PENDING: ['SCHEDULED', 'PUBLISHING', 'FAILED', 'BLOCKED'],
  SCHEDULED: ['PUBLISHING', 'FAILED', 'BLOCKED'],
  PUBLISHING: ['PUBLISHED', 'FAILED', 'PENDING'],
  PUBLISHED: [],
  FAILED: ['PENDING'],
  BLOCKED: [],
};

/**
 * Threads queue entry (Meta Threads publisher, backend parity).
 * Queue stores RAW content; length is NEVER an enqueue gate
 * (500-char truncate is a pre-publish adapter guard).
 */
export class ThreadsQueueEntry {
  public constructor(
    public readonly id: string,
    public readonly channelId: string,
    public readonly messageId: number,
    public rawContent: string,
    public status: ThreadsQueueStatus = 'PENDING',
    public readonly queuedAt: Date = new Date(),
    public matchedKeywordIds: string[] = [],
    public generatedContent: string | null = null,
    public lastError: string | null = null,
    public publishedRemoteId: string | null = null,
  ) {}

  public static create(input: {
    channelId: string;
    messageId: number;
    rawContent: string;
    matchedKeywordIds?: string[];
  }): ThreadsQueueEntry {
    const id = `${input.channelId}:${input.messageId}:${Date.now()}`;
    return new ThreadsQueueEntry(
      id,
      input.channelId,
      input.messageId,
      input.rawContent,
      'PENDING',
      new Date(),
      input.matchedKeywordIds ?? [],
    );
  }

  public transitionTo(next: ThreadsQueueStatus): void {
    const allowed = VALID_THREADS_TRANSITIONS[this.status] ?? [];
    if (!allowed.includes(next)) {
      throw new Error(
        `invalid threads transition ${this.status} -> ${next}`,
      );
    }
    this.status = next;
  }
}
