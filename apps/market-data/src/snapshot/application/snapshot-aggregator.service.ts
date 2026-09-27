import { Injectable } from '@nestjs/common';
import {
  SNAPSHOT_PROVIDER_TIMEOUT_MS,
  SNAPSHOT_QUOTE_FIELDS,
  emptySnapshotQuote,
  type QuoteFetcher,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';

export interface AggregationOutcome {
  readonly quote: SnapshotQuote;
  /** Fetcher names that contributed at least one field, in order. */
  readonly sources: ReadonlyArray<string>;
  /** Fetcher name -> failure reason (throw, timeout, or explicit no-data). */
  readonly errors: Record<string, string>;
  /** True when no field merged from any provider. */
  readonly allFailed: boolean;
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
  ): Promise<AggregationOutcome> {
    const eligible = fetchers.filter((fetcher) =>
      fetcher.supportsChains.includes(chain),
    );
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
