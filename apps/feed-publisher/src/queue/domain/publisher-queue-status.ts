/**
 * Unified-queue entry lifecycle (Tramo 2, todo 4).
 *
 * PENDING: accepted by EnqueueMatchingMessage, waiting for the drain tick.
 * SCHEDULED: claimed for an upcoming publish slot (reserved for todo 6).
 * PUBLISHING: claimed by ProcessNextQueuedArticle, render+dispatch running.
 * PUBLISHED / FAILED / BLOCKED: terminal. BLOCKED is the dedup terminal
 * (kept for audit, never drained); FAILED is retry-exhausted or TTL-expired.
 */
export type PublisherQueueStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'BLOCKED';

export const TERMINAL_QUEUE_STATUSES: ReadonlySet<PublisherQueueStatus> =
  new Set(['PUBLISHED', 'FAILED', 'BLOCKED']);

export function isTerminalQueueStatus(status: PublisherQueueStatus): boolean {
  return TERMINAL_QUEUE_STATUSES.has(status);
}
