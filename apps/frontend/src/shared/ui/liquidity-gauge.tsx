import { useState } from 'react';

interface LiquidityGaugeProps {
  lockedPercent: number | null;
  burnedPercent: number | null;
  hasData?: boolean;
}

export function LiquidityGauge({
  lockedPercent,
  burnedPercent,
  hasData = lockedPercent !== null || burnedPercent !== null,
}: LiquidityGaugeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!hasData) {
    return (
      <div
        className="relative inline-flex items-center"
        title="No RugCheck data available"
      >
        <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden opacity-50">
          <div
            className="h-full bg-slate-500 rounded-full"
            style={{ width: '0%' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Mini gauge bar */}
      <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden cursor-help">
        <div
          className="h-full bg-emerald-400 rounded-full transition-all"
          style={{
            width: `${lockedPercent ?? 0}%`,
          }}
        />
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
            {lockedPercent !== null && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-slate-400">Locked liquidity</span>
                <span className="text-slate-100 font-medium tabular-nums">
                  {lockedPercent.toFixed(2)}%
                </span>
              </div>
            )}
            {burnedPercent !== null && (
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                <span className="text-slate-400">Burned</span>
                <span className="text-slate-100 font-medium tabular-nums">
                  {burnedPercent.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
