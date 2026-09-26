import * as crypto from 'node:crypto';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type {
  ContentPayload,
  ScheduleKind,
  ScheduledPostState,
  TargetBindingRef,
} from './schedule-request';

export interface ScheduledPostProps {
  readonly id: string;
  readonly sessionId: string;
  readonly binding: TargetBindingRef;
  readonly content: ContentPayload;
  readonly scheduleKind: ScheduleKind;
  readonly idempotencyKey: string;
  readonly state: ScheduledPostState;
  readonly messageId: number | null;
  readonly firedAt: string | null;
  readonly reason: string | null;
  readonly lastFiredAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

/**
 * ScheduledPost (contract §§2-3: session → scheduler requests).
 *
 * Immutable aggregate: every command returns a new instance.
 * Creation-time content snapshot — session edits never rewrite live
 * posts (contract ambiguity #9). Terminal states (`fired`,
 * `cancelled`, `failed`) have no transitions out.
 *
 * Cross-checks mirror `ScheduledAd.validateInvariants()`: empty
 * pre-written (no text + no media) and malformed button URLs are
 * rejected at schedule time with the 422 class.
 */
export class ScheduledPost {
  private constructor(private readonly props: ScheduledPostProps) {}

  public static create(input: {
    id?: string;
    sessionId: string;
    binding: TargetBindingRef;
    content: ContentPayload;
    scheduleKind: ScheduleKind;
    idempotencyKey: string;
  }): ScheduledPost {
    const now = new Date().toISOString();
    const post = new ScheduledPost({
      id: input.id ?? `sp_${crypto.randomUUID()}`,
      sessionId: input.sessionId,
      binding: { ...input.binding },
      content: ScheduledPost.copyContent(input.content),
      scheduleKind: { ...input.scheduleKind } as ScheduleKind,
      idempotencyKey: input.idempotencyKey,
      state: 'scheduled',
      messageId: null,
      firedAt: null,
      reason: null,
      lastFiredAt: null,
      createdAt: now,
      updatedAt: now,
    });
    post.validateInvariants();
    return post;
  }

  public static fromSnapshot(props: ScheduledPostProps): ScheduledPost {
    return new ScheduledPost({
      ...props,
      binding: { ...props.binding },
      content: ScheduledPost.copyContent(props.content),
      scheduleKind: { ...props.scheduleKind } as ScheduleKind,
    });
  }

  public toSnapshot(): ScheduledPostProps {
    return {
      ...this.props,
      binding: { ...this.props.binding },
      content: ScheduledPost.copyContent(this.props.content),
      scheduleKind: { ...this.props.scheduleKind } as ScheduleKind,
    };
  }

  public get id(): string {
    return this.props.id;
  }

  public get sessionId(): string {
    return this.props.sessionId;
  }

  public get binding(): TargetBindingRef {
    return this.props.binding;
  }

  public get content(): ContentPayload {
    return this.props.content;
  }

  public get scheduleKind(): ScheduleKind {
    return this.props.scheduleKind;
  }

  public get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  public get state(): ScheduledPostState {
    return this.props.state;
  }

  public get messageId(): number | null {
    return this.props.messageId;
  }

  public get firedAt(): string | null {
    return this.props.firedAt;
  }

  public get reason(): string | null {
    return this.props.reason;
  }

  public get lastFiredAt(): string | null {
    return this.props.lastFiredAt;
  }

  /** Fire path success: records the gateway message id (no messageId = no fired). */
  public markFired(messageId: number, firedAt: string): ScheduledPost {
    this.assertMutable('markFired');
    return new ScheduledPost({
      ...this.props,
      state: 'fired',
      messageId,
      firedAt,
      reason: null,
      lastFiredAt: firedAt,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Recurring fire bookkeeping: stays `scheduled`, records the last fire. */
  public recordRecurringFire(firedAt: string, messageId: number): ScheduledPost {
    this.assertMutable('recordRecurringFire');
    return new ScheduledPost({
      ...this.props,
      messageId,
      lastFiredAt: firedAt,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Session-initiated cancel only (the scheduler never auto-cancels). */
  public cancel(sessionId: string, reason: string): ScheduledPost {
    this.assertMutable('cancel');
    if (sessionId !== this.props.sessionId) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        `scheduled post ${this.props.id} owner mismatch: session ${sessionId} is not the owning session`,
      );
    }
    return new ScheduledPost({
      ...this.props,
      state: 'cancelled',
      reason,
      updatedAt: new Date().toISOString(),
    });
  }

  public markFailed(reason: string): ScheduledPost {
    this.assertMutable('markFailed');
    return new ScheduledPost({
      ...this.props,
      state: 'failed',
      reason,
      updatedAt: new Date().toISOString(),
    });
  }

  private assertMutable(op: string): void {
    if (this.props.state !== 'scheduled') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `cannot ${op} post ${this.props.id}: terminal state ${this.props.state}`,
      );
    }
  }

  private validateInvariants(): void {
    if (!this.props.sessionId || this.props.sessionId.trim() === '') {
      throw new DomainError(
        ErrorCode.SCHEDULE_INVALID,
        'sessionId is required',
      );
    }
    if (!this.props.idempotencyKey || this.props.idempotencyKey.trim() === '') {
      throw new DomainError(
        ErrorCode.SCHEDULE_INVALID,
        'idempotencyKey is required (client-generated UUID v4)',
      );
    }
    const content = this.props.content;
    if (content.kind === 'pre-written') {
      const hasText = content.text.trim().length > 0;
      const hasMedia = (content.mediaIds ?? []).length > 0;
      if (!hasText && !hasMedia) {
        throw new DomainError(
          ErrorCode.SCHEDULE_INVALID,
          'pre-written content needs text or at least one mediaId (empty post)',
        );
      }
      for (const button of content.buttons ?? []) {
        if (!URL_PATTERN.test(button.url)) {
          throw new DomainError(
            ErrorCode.SCHEDULE_INVALID,
            `button url must be absolute http(s): ${button.url}`,
          );
        }
      }
    } else if (content.kind === 'content-ref') {
      if (!content.queueEntryId || content.queueEntryId.trim() === '') {
        throw new DomainError(
          ErrorCode.SCHEDULE_INVALID,
          'content-ref needs a queueEntryId',
        );
      }
    } else {
      throw new DomainError(
        ErrorCode.SCHEDULE_INVALID,
        `unknown content kind: ${String((content as { kind: string }).kind)}`,
      );
    }
  }

  private static copyContent(content: ContentPayload): ContentPayload {
    if (content.kind === 'pre-written') {
      return {
        kind: 'pre-written',
        text: content.text,
        mediaIds: [...content.mediaIds],
        buttons: content.buttons ? content.buttons.map((b) => ({ ...b })) : null,
      };
    }
    return { kind: 'content-ref', queueEntryId: content.queueEntryId };
  }
}
