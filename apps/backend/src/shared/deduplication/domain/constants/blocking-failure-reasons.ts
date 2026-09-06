/**
 * Failure reasons that block re-enqueuing in the deduplication logic.
 *
 * When a PublisherQueueEntry has status=FAILED with one of these reasons,
 * deduplication treats it as "already processed" and blocks re-enqueue.
 *
 * Other failure reasons (e.g. "Expired", "Publisher not configured",
 * "Rate limit exceeded") are transient/technical errors and DON'T block
 * re-enqueue — the content itself is valid, it just failed for operational
 * reasons.
 *
 * Used by: DeduplicationService hybrid logic (PENDING/PUBLISHED block always,
 * FAILED blocks only if reason matches one of these patterns).
 */
export const BLOCKING_FAILURE_REASONS = [
  /**
   * LLM output contained non-Latin characters and was rejected by
   * rejectNonLatin filter. Content itself is problematic, not operational.
   */
  'non-Latin character',

  /**
   * Content violates Telegram ToS or platform policy.
   * Should not be re-enqueued.
   */
  'Content violates policy',
  'violates policy',

  /**
   * Matched blacklist phrase. Content is explicitly blocked by
   * keyword blacklist, not a temporary issue.
   */
  'Blacklist',
  'blacklist',

  /**
   * Honeypot analysis detected scam/rug. Security-related block,
   * content should not be published ever.
   */
  'Honeypot',
  'honeypot',
  'scam',
  'rug',
];

/**
 * Check if a failure reason should block re-enqueuing.
 *
 * Returns true if the reason contains any of the BLOCKING_FAILURE_REASONS
 * patterns (case-insensitive substring match).
 */
export function isBlockingFailureReason(reason: string | null): boolean {
  if (!reason) {
    return false;
  }

  const lowerReason = reason.toLowerCase();

  return BLOCKING_FAILURE_REASONS.some((pattern) =>
    lowerReason.includes(pattern.toLowerCase()),
  );
}
