import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ThreadMessage, type ThreadMessageInput, type ThreadMessageSnapshot } from './thread-message.entity';
import {
  isThreadTerminal,
  type ThreadPublishState,
  type ThreadStatus,
} from '../thread-status';

export interface ThreadSnapshot {
  readonly id: string;
  readonly status: ThreadStatus;
  readonly messages: ThreadMessageSnapshot[];
  readonly messagesPublished: number;
  readonly lastPublishedMessageIndex: number;
  readonly attempts: number;
  readonly failureReason: string | null;
  readonly nextAttemptAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ThreadProps {
  messages: ThreadMessage[];
  status: ThreadStatus;
  messagesPublished: number;
  lastPublishedMessageIndex: number;
  attempts: number;
  failureReason: string | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Thread aggregate (Tramo 2, todo 8 — v1 skeleton).
 *
 * A multi-message container published sequentially with per-message
 * delays (spec §9). No matching, no keywords: threads go straight to
 * the publish path (the unified queue carries `contentType='threads'`
 * rows for them from todo 4).
 *
 * Failure matrix (spec §9, pinned by `publish-thread.use-case.spec.ts`):
 * - PARTIAL: message 1 ok, message 2 fails -> retry resumes from
 *   message 2 (`resumeIndex === messagesPublished`), never reposts.
 * - FAILED (critical: bad token/config) -> terminal, no retry.
 * - IN_PROGRESS + `nextAttemptAt` (transient: rate limit) -> ticks
 *   inside the backoff window attempt nothing.
 */
export class Thread extends AggregateRoot<string> {
  private state: ThreadProps;

  protected constructor(id: string, props: ThreadProps) {
    super(id);
    this.state = props;
  }

  public static create(input: {
    id?: string;
    messages: ThreadMessageInput[];
    createdAt?: Date;
  }): Thread {
    if (!Array.isArray(input.messages) || input.messages.length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'Thread requires at least one message',
      );
    }
    const id =
      input.id ??
      `thread:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = input.createdAt ?? new Date();
    const messages = input.messages.map((message, index) =>
      ThreadMessage.create(id, index, message),
    );
    return new Thread(id, {
      messages,
      status: 'DRAFT',
      messagesPublished: 0,
      lastPublishedMessageIndex: -1,
      attempts: 0,
      failureReason: null,
      nextAttemptAt: null,
      createdAt,
      updatedAt: createdAt,
    });
  }

  public static rehydrate(snapshot: ThreadSnapshot): Thread {
    return new Thread(snapshot.id, {
      messages: snapshot.messages.map((message) =>
        ThreadMessage.rehydrate(message),
      ),
      status: snapshot.status,
      messagesPublished: snapshot.messagesPublished,
      lastPublishedMessageIndex: snapshot.lastPublishedMessageIndex,
      attempts: snapshot.attempts,
      failureReason: snapshot.failureReason,
      nextAttemptAt:
        snapshot.nextAttemptAt === null
          ? null
          : new Date(snapshot.nextAttemptAt),
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    });
  }

  public get messages(): ThreadMessage[] {
    return [...this.state.messages];
  }

  public get status(): ThreadStatus {
    return this.state.status;
  }

  public get messagesPublished(): number {
    return this.state.messagesPublished;
  }

  public get lastPublishedMessageIndex(): number {
    return this.state.lastPublishedMessageIndex;
  }

  public get attempts(): number {
    return this.state.attempts;
  }

  public get failureReason(): string | null {
    return this.state.failureReason;
  }

  public get nextAttemptAt(): Date | null {
    return this.state.nextAttemptAt;
  }

  public get createdAt(): Date {
    return this.state.createdAt;
  }

  public get updatedAt(): Date {
    return this.state.updatedAt;
  }

  /** First unpublished message index — the resume point after PARTIAL. */
  public get resumeIndex(): number {
    return this.state.messagesPublished;
  }

  public isDue(now: Date): boolean {
    if (this.state.status === 'DRAFT') {
      return false;
    }
    if (isThreadTerminal(this.state.status)) {
      return false;
    }
    if (this.state.nextAttemptAt === null) {
      return true;
    }
    return now.getTime() >= this.state.nextAttemptAt.getTime();
  }

  public enqueue(): void {
    if (this.state.status !== 'DRAFT') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Thread ${this.id} cannot be enqueued from ${this.state.status}`,
      );
    }
    this.state.status = 'QUEUED';
    this.touch();
  }

  public beginAttempt(): void {
    if (isThreadTerminal(this.state.status)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Thread ${this.id} is terminal (${this.state.status}); no retry`,
      );
    }
    if (
      this.state.status !== 'QUEUED' &&
      this.state.status !== 'PARTIAL' &&
      this.state.status !== 'IN_PROGRESS'
    ) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Thread ${this.id} must be enqueued before publishing`,
      );
    }
    this.state.status = 'IN_PROGRESS';
    this.touch();
  }

  public markMessagePublished(index: number, remoteId: string | null): void {
    this.assertInProgress('markMessagePublished');
    const message = this.state.messages[index];
    if (!message) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Thread ${this.id} has no message at index ${index}`,
      );
    }
    message.markPublished(remoteId);
    this.state.messagesPublished += 1;
    this.state.lastPublishedMessageIndex = index;
    this.touch();
  }

  public markPartial(reason: string, nextAttemptAt: Date | null = null): void {
    this.assertInProgress('markPartial');
    this.state.status = 'PARTIAL';
    this.state.failureReason = reason;
    this.state.nextAttemptAt = nextAttemptAt;
    this.touch();
  }

  public markTransient(reason: string, nextAttemptAt: Date): void {
    this.assertInProgress('markTransient');
    this.state.status = 'IN_PROGRESS';
    this.state.failureReason = reason;
    this.state.nextAttemptAt = nextAttemptAt;
    this.state.attempts += 1;
    this.touch();
  }

  public markAwaitingDelay(nextAttemptAt: Date): void {
    this.assertInProgress('markAwaitingDelay');
    this.state.status = 'IN_PROGRESS';
    this.state.nextAttemptAt = nextAttemptAt;
    this.touch();
  }

  public markFailed(reason: string): void {
    this.assertInProgress('markFailed');
    this.state.status = 'FAILED';
    this.state.failureReason = reason;
    this.state.nextAttemptAt = null;
    this.touch();
  }

  public markCompleted(): void {
    this.assertInProgress('markCompleted');
    if (this.state.messagesPublished !== this.state.messages.length) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Thread ${this.id} cannot complete with ${this.state.messages.length - this.state.messagesPublished} unpublished messages`,
      );
    }
    this.state.status = 'COMPLETED';
    this.state.failureReason = null;
    this.state.nextAttemptAt = null;
    this.touch();
  }

  /**
   * Spec §9 failure-handling view. DRAFT/QUEUED have published nothing
   * yet, so they report IN_PROGRESS with a zero count (the run has not
   * started, resume index 0).
   */
  public toPublishState(): ThreadPublishState {
    const status =
      this.state.status === 'PARTIAL'
        ? 'PARTIAL'
        : this.state.status === 'COMPLETED'
          ? 'COMPLETED'
          : this.state.status === 'FAILED'
            ? 'FAILED'
            : 'IN_PROGRESS';
    return {
      threadId: this.id,
      messagesPublished: this.state.messagesPublished,
      lastPublishedMessageIndex: this.state.lastPublishedMessageIndex,
      status,
      failureReason: this.state.failureReason,
    };
  }

  public toSnapshot(): ThreadSnapshot {
    return {
      id: this.id,
      status: this.state.status,
      messages: this.state.messages.map((message) => message.toSnapshot()),
      messagesPublished: this.state.messagesPublished,
      lastPublishedMessageIndex: this.state.lastPublishedMessageIndex,
      attempts: this.state.attempts,
      failureReason: this.state.failureReason,
      nextAttemptAt: this.state.nextAttemptAt
        ? this.state.nextAttemptAt.toISOString()
        : null,
      createdAt: this.state.createdAt.toISOString(),
      updatedAt: this.state.updatedAt.toISOString(),
    };
  }

  private assertInProgress(caller: string): void {
    if (this.state.status !== 'IN_PROGRESS') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Thread ${this.id} cannot ${caller} from ${this.state.status}`,
      );
    }
  }

  private touch(at: Date = new Date()): void {
    this.state.updatedAt = at;
  }
}
