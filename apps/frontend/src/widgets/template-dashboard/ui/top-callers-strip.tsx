import type { KolRankingRow, RankingWindow } from '@/entities/template';

interface TopCallersStripProps {
  readonly rows: ReadonlyArray<KolRankingRow>;
  readonly window: RankingWindow;
  readonly onWindowChange: (window: RankingWindow) => void;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

const WINDOWS: ReadonlyArray<RankingWindow> = ['30d', '7d', '1d'];

export function TopCallersStrip({
  rows,
  window,
  onWindowChange,
  isLoading,
  isError,
}: TopCallersStripProps) {
  return (
    <section
      data-testid="top-callers-strip"
      aria-label="Top callers"
      className="rounded bg-slate-900 p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">
          Top 10 callers by calls
        </h3>
        <div
          data-testid="window-selector"
          role="group"
          aria-label="Ranking window"
          className="flex gap-1"
        >
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              data-testid={`window-${w}`}
              aria-pressed={window === w}
              className={`rounded px-2 py-1 text-xs ${
                window === w
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-700 text-slate-300'
              }`}
              onClick={() => onWindowChange(w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <p data-testid="top-callers-loading" className="text-sm text-slate-400">
          Cargando callers…
        </p>
      ) : isError || rows.length === 0 ? (
        <p data-testid="top-callers-empty" className="text-sm text-slate-400">
          No caller data — API unreachable. Showing empty state.
        </p>
      ) : (
        <div
          data-testid="top-callers-list"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {rows.slice(0, 10).map((row) => (
            <div
              key={row.caller}
              data-testid={`top-caller-${row.caller}`}
              className="min-w-[120px] rounded bg-slate-800 px-3 py-2"
            >
              <p className="text-sm font-semibold text-slate-100">
                {row.caller}
              </p>
              <p
                data-testid={`top-caller-count-${row.caller}`}
                className="text-xs text-slate-400"
              >
                {row.callsCount} calls · {row.display}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
