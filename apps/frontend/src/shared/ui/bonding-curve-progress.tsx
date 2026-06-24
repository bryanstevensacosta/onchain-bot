interface BondingCurveProgressProps {
  bondingPercent: number | null;
  factory: string | null;
}

export function BondingCurveProgress({
  bondingPercent,
  factory,
}: BondingCurveProgressProps) {
  if (bondingPercent === null) {
    return (
      <span className="text-xs text-slate-500" title="No bonding data">
        —
      </span>
    );
  }

  const isPumpFun = factory === 'pumpfun';
  const graduated = bondingPercent >= 99;

  const color = graduated
    ? 'bg-emerald-400'
    : bondingPercent >= 75
      ? 'bg-amber-400'
      : 'bg-rose-400';

  return (
    <div className="flex items-center gap-2">
      {isPumpFun && (
        <span className="text-xs text-slate-400">
          {graduated ? '🎓 Graduated' : 'On bonding curve'}
        </span>
      )}
      <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${Math.min(bondingPercent, 100)}%` }}
        />
      </div>
      <span className="text-xs text-slate-100 tabular-nums font-medium">
        {bondingPercent.toFixed(1)}%
      </span>
    </div>
  );
}
