// @vitest-environment jsdom
import '@/test/setup';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePagination } from './use-pagination';

const makeItems = (n: number): ReadonlyArray<{ id: number }> =>
  Array.from({ length: n }, (_, i) => ({ id: i }));

describe('usePagination — page math', () => {
  it('returns page 1 with all items when data fits in one page', () => {
    const { result } = renderHook(() => usePagination(makeItems(5), 10));
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.visible).toHaveLength(5);
    expect(result.current.rangeStart).toBe(1);
    expect(result.current.rangeEnd).toBe(5);
    expect(result.current.total).toBe(5);
  });

  it('returns 1-based rangeStart even when slicing past page 1', () => {
    const { result } = renderHook(() => usePagination(makeItems(30), 10));
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);
    expect(result.current.rangeStart).toBe(11);
    expect(result.current.rangeEnd).toBe(20);
    expect(result.current.visible).toHaveLength(10);
    expect(result.current.visible[0]?.id).toBe(10);
    expect(result.current.visible[9]?.id).toBe(19);
  });

  it('computes totalPages with ceiling for non-divisible sizes', () => {
    // 25 items / 10 per page = 2.5 → 3 pages
    const { result } = renderHook(() => usePagination(makeItems(25), 10));
    expect(result.current.totalPages).toBe(3);
    expect(result.current.total).toBe(25);
  });

  it('last page rangeEnd equals total (not pageSize)', () => {
    const { result } = renderHook(() => usePagination(makeItems(25), 10));
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    expect(result.current.rangeStart).toBe(21);
    expect(result.current.rangeEnd).toBe(25);
    expect(result.current.visible).toHaveLength(5);
  });
});

describe('usePagination — empty data', () => {
  it('returns 1 page with empty visible when data is undefined', () => {
    const { result } = renderHook(() => usePagination(undefined, 10));
    expect(result.current.totalPages).toBe(1);
    expect(result.current.visible).toEqual([]);
    expect(result.current.rangeStart).toBe(0);
    expect(result.current.rangeEnd).toBe(0);
    expect(result.current.total).toBe(0);
    expect(result.current.canPrev).toBe(false);
    expect(result.current.canNext).toBe(false);
  });

  it('returns 1 page with empty visible when data is null', () => {
    const { result } = renderHook(() => usePagination(null, 10));
    expect(result.current.visible).toEqual([]);
    expect(result.current.totalPages).toBe(1);
  });

  it('returns 1 page with empty visible when data is empty array', () => {
    const { result } = renderHook(() => usePagination([], 10));
    expect(result.current.visible).toEqual([]);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.canPrev).toBe(false);
    expect(result.current.canNext).toBe(false);
  });
});

describe('usePagination — canPrev / canNext flags', () => {
  it('disables both navigation on page 1 with multiple pages', () => {
    const { result } = renderHook(() => usePagination(makeItems(30), 10));
    expect(result.current.page).toBe(1);
    expect(result.current.canPrev).toBe(false);
    expect(result.current.canNext).toBe(true);
  });

  it('enables both navigation on middle pages', () => {
    const { result } = renderHook(() => usePagination(makeItems(30), 10));
    act(() => result.current.setPage(2));
    expect(result.current.canPrev).toBe(true);
    expect(result.current.canNext).toBe(true);
  });

  it('disables next on last page', () => {
    const { result } = renderHook(() => usePagination(makeItems(30), 10));
    act(() => result.current.setPage(3));
    expect(result.current.canPrev).toBe(true);
    expect(result.current.canNext).toBe(false);
  });
});

describe('usePagination — page clamping', () => {
  it('clamps page to last when data shrinks below current page', () => {
    // Start with 50 items (5 pages), then shrink to 5 items (1 page)
    const { result, rerender } = renderHook(
      ({ data }: { data: ReadonlyArray<{ id: number }> }) =>
        usePagination(data, 10),
      { initialProps: { data: makeItems(50) } },
    );
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);

    rerender({ data: makeItems(5) });
    // Should clamp to 1 (the only valid page now)
    expect(result.current.page).toBe(1);
    expect(result.current.visible).toHaveLength(5);
  });

  it('clamps to 1 when setPage is called with 0', () => {
    const { result } = renderHook(() => usePagination(makeItems(30), 10));
    act(() => result.current.setPage(0));
    expect(result.current.page).toBe(1);
  });

  it('clamps to last when setPage is called past totalPages', () => {
    const { result } = renderHook(() => usePagination(makeItems(30), 10));
    act(() => result.current.setPage(99));
    expect(result.current.page).toBe(3);
  });
});