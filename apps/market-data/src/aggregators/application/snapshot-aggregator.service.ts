import { Injectable } from '@nestjs/common';
import {
  SNAPSHOT_PROVIDER_TIMEOUT_MS,
  SNAPSHOT_QUOTE_FIELDS,
  emptySnapshotQuote,
  type QuoteFetcher,
  type SnapshotQuote,
} from 'snapshot/domain/snapshot-quote.types';

export interface AggregationOutcome {
  readonly quote: SnapshotQuote;
  /** Fetcher names that contributed at least one field, in order. */
  readonly sources: ReadonlyArray<string>;
  /** Fetcher name -> failure reason (throw, timeout, or explicit no-data). */
  readonly errors: Record<string, string>;
  /** True when no field merged from any provider. */
  readonly allFailed: boolean;
}

/**
 * Aggregation options (dexter plan todo 21c). Additive: the default
 * call shape keeps the byte-identical allSettled path.
 */
export interface AggregationOptions {
  /**
   * Whole-fan-out race deadline in ms. When a positive finite value
   * is passed, the aggregator stops WAITING at the deadline and
   * records unfinished fetchers as ABANDONED (rejected records naming
   * the deadline — fail-open): a straggler never blocks the serve.
   * Absent/<=0 keeps the per-fetcher-timeout-only behavior.
   */
  readonly deadlineMs?: number;
}

function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  name: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${name} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}

/**
 * SnapshotAggregatorService (Tramo 3, todo-3 aggregation gap).
 *
 * Fans out to the supporting providers IN PARALLEL (`Promise.allSettled`
 * + per-call timeout) and merges first-non-null per field. Pure merge
 * logic — health recording stays with the caller (the snapshot service
 * owns the registry), so this unit stays deterministic without Nest.
 */
@Injectable()
export class SnapshotAggregatorService {
  public async aggregate(
    chain: string,
    address: string,
    fetchers: ReadonlyArray<QuoteFetcher>,
    timeoutMs: number = SNAPSHOT_PROVIDER_TIMEOUT_MS,
    options?: AggregationOptions,
  ): Promise<AggregationOutcome> {
    const eligible = fetchers.filter((fetcher) =>
      fetcher.supportsChains.includes(chain),
    );
    const deadlineMs = options?.deadlineMs ?? 0;
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
      const settled = await Promise.allSettled(
        eligible.map(async (fetcher) => ({
          name: fetcher.name,
          quote: await withTimeout(
            fetcher.fetch(chain, address),
            timeoutMs,
            fetcher.name,
          ),
        })),
      );
      return this.mergeOutcome(eligible, settled);
    }
    // Deadline path (dexter plan todo 21c): per-index records + ONE
    // race. Every task settles into its record — INCLUDING a sync
    // throw from `fetcher.fetch` (the try wraps the call itself, same
    // absorption `Promise.allSettled` gave the default path). The
    // timer end of the race abandons whatever has not written a
    // record yet. Late settlers keep writing into `records` — the
    // `settled` snapshot below is already mapped (fail-open by
    // construction; tasks never reject, `withTimeout` observes its own
    // work, and `Promise.race` subscribes to `Promise.all(tasks)`).
    type TaskValue = {
      readonly name: string;
      readonly quote: Partial<SnapshotQuote> | null;
    };
    const records: Array<PromiseSettledResult<TaskValue> | null> =
      eligible.map(() => null);
    const tasks = eligible.map((fetcher, index) =>
      (async () => {
        try {
          const quote = await withTimeout(
            fetcher.fetch(chain, address),
            timeoutMs,
            fetcher.name,
          );
          records[index] = {
            status: 'fulfilled',
            value: { name: fetcher.name, quote },
          };
        } catch (reason) {
          records[index] = { status: 'rejected', reason };
        }
      })(),
    );
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = new Promise<'deadline'>((resolve) => {
      timer = setTimeout(() => resolve('deadline'), deadlineMs);
      if (timer !== null && typeof timer.unref === 'function') {
        timer.unref();
      }
    });
    try {
      await Promise.race([
        Promise.all(tasks).then(() => 'settled' as const),
        deadline,
      ]);
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
    const settled: ReadonlyArray<PromiseSettledResult<TaskValue>> =
      records.map(
        (record) =>
          record ?? {
            status: 'rejected',
            reason: new Error(
              `abandoned at fanout deadline (${deadlineMs}ms) — fail-open`,
            ),
          },
      );
    return this.mergeOutcome(eligible, settled);
  }

  /**
   * Merge step (dexter plan todo 21c): extracted verbatim from the
   * pre-deadline `aggregate` body — first-non-null per field, sources
   * in eligible order, errors keyed by fetcher name.
   */
  private mergeOutcome(
    eligible: ReadonlyArray<QuoteFetcher>,
    settled: ReadonlyArray<
      PromiseSettledResult<{
        readonly name: string;
        readonly quote: Partial<SnapshotQuote> | null;
      }>
    >,
  ): AggregationOutcome {
    const quotes = new Map<string, Partial<SnapshotQuote>>();
    const errors: Record<string, string> = {};
    for (let i = 0; i < settled.length; i += 1) {
      const fetcher = eligible[i];
      const result = settled[i];
      if (result.status === 'fulfilled') {
        const quote = result.value.quote;
        if (quote === null) {
          errors[fetcher.name] = 'no data';
        } else {
          quotes.set(fetcher.name, quote);
        }
      } else {
        const reason = result.reason;
        errors[fetcher.name] =
          reason instanceof Error ? reason.message : String(reason);
      }
    }
    type MergeAcc = {
      -readonly [K in keyof SnapshotQuote]:
        | number
        | string
        | ReadonlyArray<unknown>
        | null;
    };
    const merged: MergeAcc = { ...emptySnapshotQuote() };
    const sources: Array<string> = [];
    for (const fetcher of eligible) {
      const quote = quotes.get(fetcher.name);
      if (quote === undefined) {
        continue;
      }
      let contributed = false;
      for (const field of SNAPSHOT_QUOTE_FIELDS) {
        const current = merged[field] as unknown;
        const value = quote[field] as unknown;
        if (current === null && value !== null && value !== undefined) {
          (merged as Record<string, unknown>)[field] = value;
          contributed = true;
        }
      }
      if (contributed) {
        sources.push(fetcher.name);
      }
    }
    const allFailed = sources.length === 0;
    return {
      quote: merged as SnapshotQuote,
      sources,
      errors,
      allFailed,
    };
  }
}
