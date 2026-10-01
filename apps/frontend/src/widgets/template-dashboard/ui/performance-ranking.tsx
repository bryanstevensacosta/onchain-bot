import { useState } from 'react';
import type { KolRankingRow } from '@/entities/template';
import {
  sortRankings,
  splitRankingHalves,
  togglePerfSort,
} from '@/entities/template';

interface PerformanceRankingProps {
  readonly rows: ReadonlyArray<KolRankingRow>;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

function RankCard({ row }: { row: KolRankingRow }) {
  return (
    <div
      data-testid={`perf-card-${row.caller}`}
      className="rounded bg-slate-800 px-3 py-2"
    >
      <p className="text-sm font-semibold text-slate-100">{row.caller}</p>
      <p className="text-xs text-slate-400">
        {row.display} · {row.callsCount} calls
      </p>
    </div>
  );
}

export function PerformanceRanking({
  rows,
  isLoading,
  isError,
}: PerformanceRankingProps) {
  const [sort, setSort] = useState<'perf_desc' | 'perf_asc'>('perf_desc');
  if (isLoading) {
    return (
      <div
        data-testid="perf-ranking-loading"
        className="rounded bg-slate-900 p-4 text-sm text-slate-400"
      >
        Cargando ranking…
      </div>
    );
  }
  if (isError || rows.length === 0) {
    return (
      <div
        data-testid="perf-ranking-empty"
        className="rounded bg-slate-900 p-4 text-sm text-slate-400"
      >
        No ranking data — API unreachable. Showing empty state.
      </div>
    );
  }
  const sorted = sortRankings(rows, sort);
  const { left, right } = splitRankingHalves(sorted);
  return (
    <section
      data-testid="kol-rankings-table"
      aria-label="Performance ranking"
      className="rounded bg-slate-900 p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">
          Performance ranking (top 10)
        </h3>
        <button
          type="button"
          data-testid="perf-sort-toggle"
          aria-label={
            sort === 'perf_desc' ? 'Sort ascending' : 'Sort descending'
          }
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
          onClick={() => setSort(togglePerfSort(sort))}
        >
          {sort === 'perf_desc' ? '▼ desc' : '▲ asc'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div data-testid="perf-half-left" className="space-y-2">
          {left.map((row) => (
            <RankCard key={row.caller} row={row} />
          ))}
        </div>
        <div data-testid="perf-half-right" className="space-y-2">
          {right.map((row) => (
            <RankCard key={row.caller} row={row} />
          ))}
        </div>
      </div>
    </section>
  );
}
