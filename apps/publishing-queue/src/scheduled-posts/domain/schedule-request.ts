import type { SchedulingTarget } from 'scheduling/domain/scheduling-target';

/**
 * Contract §2: exactly one binding per request (fan-out is N requests,
 * one per binding). `chatId` MUST equal the binding bot defaultChatId
 * (verified channel); `botId` is a vault id post-migration, never a
 * raw token.
 */
export interface TargetBindingRef {
  readonly target: SchedulingTarget;
  readonly bindingId: string;
  readonly botId: string;
  readonly chatId: string;
}

export interface PreWrittenContent {
  readonly kind: 'pre-written';
  readonly text: string;
  readonly mediaIds: string[];
  readonly buttons: Array<{ text: string; url: string }> | null;
}

export interface ContentRefContent {
  readonly kind: 'content-ref';
  readonly queueEntryId: string;
}

export type ContentPayload = PreWrittenContent | ContentRefContent;

export interface ScheduleKindOnce {
  readonly kind: 'once';
  /** ISO-8601 UTC, MUST be > now. */
  readonly fireAt: string;
}

export interface ScheduleKindCron {
  readonly kind: 'cron';
  /** 5-field cron. */
  readonly cronExpr: string;
  /** ONLY UTC. */
  readonly timezone: 'UTC';
}

/** oneShot XOR recurring, never both, never neither. */
export type ScheduleKind = ScheduleKindOnce | ScheduleKindCron;

export interface ScheduleRequest {
  readonly sessionId: string;
  readonly binding: TargetBindingRef;
  readonly content: ContentPayload;
  readonly scheduleKind: ScheduleKind;
  /** Client-generated UUID v4; REQUIRED; scope = per-session. */
  readonly idempotencyKey: string;
}

export type ScheduledPostState = 'scheduled' | 'fired' | 'cancelled' | 'failed';

/**
 * Terminal callback (contract §4): exactly one per request,
 * at-least-once with idempotent consumer (sessions dedup on
 * `scheduledPostId`). `messageId`/`firedAt` set ONLY on fired;
 * `reason` is a §6 machine code on cancelled/failed, null on fired.
 */
export interface ScheduleResultCallback {
  readonly scheduledPostId: string;
  readonly sessionId: string;
  readonly bindingId: string;
  readonly target: SchedulingTarget;
  readonly state: 'fired' | 'cancelled' | 'failed';
  readonly messageId: string | null;
  readonly firedAt: string | null;
  readonly reason: string | null;
  readonly idempotencyKey: string;
}
