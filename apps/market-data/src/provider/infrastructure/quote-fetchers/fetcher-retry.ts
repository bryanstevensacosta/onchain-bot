import { Logger } from '@nestjs/common';
import { RetryableProviderError } from '../../domain/retryable-provider.error';
import type { QuoteFetcher } from 'snapshot/domain/snapshot-quote.types';

/**
 * Per-fetcher single retry (dexter plan todo 19b2).
 *
 * NOT the aggregator: retrying in the aggregator would see only
 * "contributes nothing" (timeout and genuine 404 converge there —
 * null-rootcause §1.4), so the taxonomy would be dead. Here each
 * fetcher keeps its own error: adapters surface timeout /
 * 429-with-`Retry-After` / 5xx as `RetryableProviderError` and keep
 * 404 + everything else as `null`, so this wrapper retries EXACTLY
 * the transient class and never a 404 / `no data`.
 *
 * WORST-CASE MATH (2 req/miss max, no phantom budget): this wrapper
 * is wired OUTSIDE the outbound gate (`AddressSnapshotService`:
 * policy → retry → gate → aggregate), so EVERY attempt runs the
 * GATED fetch and burns `cost` slots from the SAME
 * `outbound:<name>` bucket (`provider-outbound-limits.ts` +
 * `provider-descriptor.ts` — the single budget source, unchanged).
 * One snapshot miss costs at most 2 × cost tokens on one provider's
 * bucket (vs the pre-19a re-warm loop-N, and vs a header-blind
 * `Retry-After: 120s` wait — the cap pins the wait at ≤2s+jitter).
 * The retry NEVER mints quota: a denied second attempt surfaces as
 * the gate's fail-open deny and the snapshot still merges the rest.
 *
 * Delay: `min(parseRetryAfter, 2000ms)` + full jitter, i.e.
 * `capped + random(0, capped)`. A 120s header waits ~2–4s, never
 * 120s. Timeouts / headerless 5xx carry `retryAfterMs: 0` → the
 * retry fires immediately (the 8s adapter timeout already spaces
 * the attempts). 429 WITHOUT the header never reaches this wrapper
 * (classifier returns null → adapter null → no retry).
 *
 * Second failure → `null` (fail-open, aggregator records `no data`
 * exactly like today — NO third attempt, and NO throw, so the
 * snapshot merge is byte-identical to the pre-retry miss path; the
 * exhausted retry is debug-logged as the signal todo 19b3's breaker
 * observes). Non-retryable throws (outbound-deny, programming
 * errors) are RETHROWN untouched so the gate's fail-open message
 * survives in `providerErrors`.
 */
export const FETCHER_RETRY_CAP_MS = 2_000;

/** Injectable clock/randomness for specs (production: real timers). */
export interface FetcherRetryDeps {
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * `min(retryAfterMs, cap)` + full jitter (`random() * capped`).
 * Pure + deterministic under an injected `random` (specs pin the cap
 * with `random = () => ~1`; jitter decorrelation is proven
 * statistically in `fetcher-retry.spec.ts`).
 */
export function computeRetryDelayMs(
  retryAfterMs: number,
  random: () => number = Math.random,
  capMs: number = FETCHER_RETRY_CAP_MS,
): { readonly cappedMs: number; readonly delayMs: number } {
  const cappedMs = Math.min(Math.max(0, retryAfterMs), capMs);
  return { cappedMs, delayMs: cappedMs + random() * cappedMs };
}

const retryLogger = new Logger('FetcherRetry');

export function applySingleRetryFetchers(
  fetchers: ReadonlyArray<QuoteFetcher>,
  deps: FetcherRetryDeps = {},
): ReadonlyArray<QuoteFetcher> {
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  return fetchers.map((fetcher) => ({
    ...fetcher,
    fetch: async (chain: string, address: string) => {
      let first: unknown;
      try {
        return await fetcher.fetch(chain, address);
      } catch (err) {
        first = err;
      }
      if (!(first instanceof RetryableProviderError)) {
        throw first;
      }
      const { cappedMs, delayMs } = computeRetryDelayMs(
        first.retryAfterMs,
        random,
      );
      await sleep(delayMs);
      try {
        return await fetcher.fetch(chain, address);
      } catch (second) {
        retryLogger.debug(
          `${fetcher.name} retry exhausted (${first.kind}, waited ${Math.round(cappedMs)}ms+capped jitter) — null, fail-open: ${(second as Error)?.message ?? second}`,
        );
        return null;
      }
    },
  }));
}
