/**
 * Thread lifecycle (Tramo 2, todo 8 — v1 skeleton).
 *
 * DRAFT: built by ThreadBuilderService, not yet queued.
 * QUEUED: accepted by EnqueueThreadUseCase, waiting for the cron tick.
 * IN_PROGRESS: claimed by PublishThreadUseCase, per-message dispatch
 *   running (also the transient-hold state: rate-limit backoff waits
 *   here with `nextAttemptAt` set, attempts counted).
 * PARTIAL: some messages published, then a failure stopped the run —
 *   retry resumes from `messagesPublished` (never reposts message 1).
 * COMPLETED / FAILED: terminal. FAILED is never retried (fix the
 *   token/config first); COMPLETED is never republished.
 */
export type ThreadStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED';

export const THREAD_TERMINAL_STATUSES: ReadonlySet<ThreadStatus> = new Set([
  'COMPLETED',
  'FAILED',
]);

export function isThreadTerminal(status: ThreadStatus): boolean {
  return THREAD_TERMINAL_STATUSES.has(status);
}

/**
 * Publish-flow status (spec §9 failure handling — the exact 4-state
 * shape the template side consumes in v2).
 */
export type ThreadPublishFlowStatus =
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED';

export interface ThreadPublishState {
  readonly threadId: string;
  readonly messagesPublished: number;
  readonly lastPublishedMessageIndex: number;
  readonly status: ThreadPublishFlowStatus;
  readonly failureReason: string | null;
}
