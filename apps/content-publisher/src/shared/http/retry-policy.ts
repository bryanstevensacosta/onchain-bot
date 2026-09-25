/**
 * RetryPolicy (Tramo 2, todo 1).
 *
 * Bounded exponential backoff for outbound HTTP (ingestion feed reads,
 * Bot API sends, LLM gateway): delay capped, attempts capped so a
 * hung upstream never stalls a cron tick.
 */
export interface RetryPolicyOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
};

export function delayForAttempt(
  attempt: number,
  options: RetryPolicyOptions = DEFAULT_RETRY_POLICY,
): number {
  const delay = options.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, options.maxDelayMs);
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryPolicyOptions = DEFAULT_RETRY_POLICY,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt < options.maxAttempts) {
        await sleep(delayForAttempt(attempt, options));
      }
    }
  }
  throw lastError;
}
