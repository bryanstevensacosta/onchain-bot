export type FeedThreadStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED';

/**
 * Feed thread aggregate (feed-publisher parity: DRAFT->QUEUED->
 * IN_PROGRESS->COMPLETED, PARTIAL resume, FAILED terminal).
 */
export class FeedThread {
  public constructor(
    public readonly id: string,
    public status: FeedThreadStatus = 'DRAFT',
    public readonly messages: Array<{ content: string; delayMs: number }> = [],
    public messagesPublished = 0,
    public failureReason: string | null = null,
  ) {}

  public static create(
    messages: Array<{ content: string; delayMs: number }>,
  ): FeedThread {
    return new FeedThread(`th-${Date.now()}`, 'DRAFT', messages);
  }

  public enqueue(): void {
    if (this.status !== 'DRAFT') {
      throw new Error(`cannot enqueue from ${this.status}`);
    }
    this.status = 'QUEUED';
  }

  public toPublishState(): {
    threadId: string;
    messagesPublished: number;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  } {
    if (this.status === 'COMPLETED') {
      return {
        threadId: this.id,
        messagesPublished: this.messagesPublished,
        status: 'COMPLETED',
      };
    }
    if (this.status === 'FAILED') {
      return {
        threadId: this.id,
        messagesPublished: this.messagesPublished,
        status: 'FAILED',
      };
    }
    if (this.messagesPublished > 0) {
      return {
        threadId: this.id,
        messagesPublished: this.messagesPublished,
        status: 'PARTIAL',
      };
    }
    return {
      threadId: this.id,
      messagesPublished: 0,
      status: 'IN_PROGRESS',
    };
  }
}
