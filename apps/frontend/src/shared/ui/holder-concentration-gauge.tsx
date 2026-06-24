import { useState } from 'react';

interface HolderConcentrationGaugeProps {
  top10HolderPercent: number | null;
  insidersPercent: number | null;
  bundlersPercent: number | null;
  devPercent: number | null;
}

const BUNDLERS_HIGH_THRESHOLD = 30;
const INSIDERS_HIGH_THRESHOLD = 50;

export function HolderConcentrationGauge({
  top10HolderPercent,
  insidersPercent,
  bundlersPercent,
  devPercent,
}: HolderConcentrationGaugeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const hasData =
    top10HolderPercent !== null ||
    insidersPercent !== null ||
    bundlersPercent !== null ||
    devPercent !== null;

  if (!hasData) {
    return (
      <span
        className="text-xs text-slate-500"
        title="No Mobula holder concentration data"
      >
        —
      </span>
    );
  }

  const segments: Array<{
    label: string;
    value: number | null;
    color: string;
    warning: boolean;
  }> = [
    {
      label: 'Top 10',
      value: top10HolderPercent,
      color: 'bg-amber-400',
      warning: top10HolderPercent !== null && top10HolderPercent > 80,
    },
    {
      label: 'Insiders',
      value: insidersPercent,
      color: 'bg-rose-400',
      warning:
        insidersPercent !== null && insidersPercent > INSIDERS_HIGH_THRESHOLD,
    },
    {
      label: 'Bundlers',
      value: bundlersPercent,
      color: 'bg-fuchsia-400',
      warning:
        bundlersPercent !== null && bundlersPercent > BUNDLERS_HIGH_THRESHOLD,
    },
    {
      label: 'Dev',
      value: devPercent,
      color: 'bg-red-500',
      warning: devPercent !== null && devPercent > 5,
    },
  ];

  const anyWarning = segments.some((s) => s.warning);

  return (
    <div
      className="relative inline-flex items-center gap-2"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {anyWarning && (
        <span
          className="text-rose-400 text-xs font-bold"
          title="Holder concentration warning"
        >
          ⚠
        </span>
      )}
      <div className="flex h-2 w-20 bg-slate-700 rounded-full overflow-hidden cursor-help">
        {segments.map((s) =>
          s.value !== null ? (
            <div
              key={s.label}
              className={`h-full ${s.color} transition-all`}
              style={{ width: `${Math.min(s.value, 100)}%` }}
            />
          ) : null,
        )}
      </div>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
            {segments.map((s) =>
              s.value !== null ? (
                <div
                  key={s.label}
                  className={`flex items-center gap-2 ${
                    s.warning ? 'text-rose-300' : ''
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${s.color} shrink-0`}
                  />
                  <span className="text-slate-400">{s.label}</span>
                  <span className="text-slate-100 font-medium tabular-nums">
                    {s.value.toFixed(1)}%
                  </span>
                  {s.warning && (
                    <span className="text-rose-400 text-[10px]">⚠</span>
                  )}
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
