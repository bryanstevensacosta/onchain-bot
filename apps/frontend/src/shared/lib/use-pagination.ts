import { useState } from 'react';

interface UsePaginationResult<T> {
  /** Sliced view of the current page. */
  readonly visible: ReadonlyArray<T>;
  /** 1-based current page (clamped to [1, totalPages]). */
  readonly page: number;
  /** Total number of pages. Always >= 1. */
  readonly totalPages: number;
  /** First visible item's index (1-based) for the "N-M" indicator. */
  readonly rangeStart: number;
  /** Last visible item's index (1-based) for the "N-M" indicator. */
  readonly rangeEnd: number;
  /** Total item count. */
  readonly total: number;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly setPage: (next: number) => void;
}

/**
 * Generic client-side pagination hook.
 *
 * Clamps `page` to the valid range when data shrinks (e.g., after a filter
 * shrinks the total count below the current page). Returns a `visible` slice
 * of the current page along with range info for "N-M de TOTAL" indicators.
 */
export function usePagination<T>(
  data: ReadonlyArray<T> | null | undefined,
  pageSize: number,
): UsePaginationResult<T> {
  const [page, setPageRaw] = useState(1);

  const total = data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const start = (pageSafe - 1) * pageSize;

  return {
    visible: data?.slice(start, start + pageSize) ?? [],
    page: pageSafe,
    totalPages,
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, total),
    total,
    canPrev: pageSafe > 1,
    canNext: pageSafe < totalPages,
    setPage: setPageRaw,
  };
}