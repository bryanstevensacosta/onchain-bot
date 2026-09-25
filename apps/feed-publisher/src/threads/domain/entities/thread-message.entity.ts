import { Entity } from 'shared/kernel/entity';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export interface ThreadMessageInput {
  readonly content: string;
  readonly mediaUrls?: string[];
  readonly delaySeconds?: number;
}

interface ThreadMessageProps {
  readonly threadId: string;
  readonly index: number;
  readonly content: string;
  readonly mediaUrls: string[];
  readonly delaySeconds: number;
  publishedAt: Date | null;
  remoteId: string | null;
}

export interface ThreadMessageSnapshot {
  readonly id: string;
  readonly threadId: string;
  readonly index: number;
  readonly content: string;
  readonly mediaUrls: string[];
  readonly delaySeconds: number;
  readonly publishedAt: string | null;
  readonly remoteId: string | null;
}

/**
 * ThreadMessage: one message inside a Thread (spec §9
 * `ThreadMessageInput`: content + mediaUrls + delaySeconds).
 *
 * Invariants: non-blank content, finite delaySeconds >= 0. Id is
 * `${threadId}:${index}` (deterministic, FK-less by design).
 */
export class ThreadMessage extends Entity<string> {
  private state: ThreadMessageProps;

  protected constructor(id: string, props: ThreadMessageProps) {
    super(id);
    this.state = props;
  }

  public static create(
    threadId: string,
    index: number,
    input: ThreadMessageInput,
  ): ThreadMessage {
    if (typeof input.content !== 'string' || input.content.trim().length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ThreadMessage requires non-blank content',
        { threadId, index },
      );
    }
    const delaySeconds = input.delaySeconds ?? 0;
    if (!Number.isFinite(delaySeconds) || delaySeconds < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'ThreadMessage delaySeconds must be a finite number >= 0',
        { threadId, index, delaySeconds },
      );
    }
    return new ThreadMessage(`${threadId}:${index}`, {
      threadId,
      index,
      content: input.content,
      mediaUrls: [...(input.mediaUrls ?? [])],
      delaySeconds,
      publishedAt: null,
      remoteId: null,
    });
  }

  public static rehydrate(snapshot: ThreadMessageSnapshot): ThreadMessage {
    const message = new ThreadMessage(snapshot.id, {
      threadId: snapshot.threadId,
      index: snapshot.index,
      content: snapshot.content,
      mediaUrls: [...snapshot.mediaUrls],
      delaySeconds: snapshot.delaySeconds,
      publishedAt:
        snapshot.publishedAt === null ? null : new Date(snapshot.publishedAt),
      remoteId: snapshot.remoteId,
    });
    return message;
  }

  public get threadId(): string {
    return this.state.threadId;
  }

  public get index(): number {
    return this.state.index;
  }

  public get content(): string {
    return this.state.content;
  }

  public get mediaUrls(): string[] {
    return [...this.state.mediaUrls];
  }

  public get delaySeconds(): number {
    return this.state.delaySeconds;
  }

  public get publishedAt(): Date | null {
    return this.state.publishedAt;
  }

  public get remoteId(): string | null {
    return this.state.remoteId;
  }

  public get isPublished(): boolean {
    return this.state.publishedAt !== null;
  }

  public markPublished(remoteId: string | null, at: Date = new Date()): void {
    this.state.publishedAt = at;
    this.state.remoteId = remoteId;
  }

  public toSnapshot(): ThreadMessageSnapshot {
    return {
      id: this.id,
      threadId: this.state.threadId,
      index: this.state.index,
      content: this.state.content,
      mediaUrls: [...this.state.mediaUrls],
      delaySeconds: this.state.delaySeconds,
      publishedAt: this.state.publishedAt
        ? this.state.publishedAt.toISOString()
        : null,
      remoteId: this.state.remoteId,
    };
  }
}
