import type { TokenScoreView } from '../model/types';
import { Badge, ChainIcon } from '@/shared/ui';
import { signalLabel } from '@/shared/lib/signalLabels';
import { tierTone } from '../model/tier';

interface ScoreGaugeProps {
  score: number;
  tier?: TokenScoreView['tier'];
}

export function ScoreGauge({ score, tier }: ScoreGaugeProps) {
  const width = Math.min(100, Math.max(0, score));
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold tabular-nums">{score}</span>
        {tier && <Badge tone={tierTone(tier)}>{tier}</Badge>}
      </div>
      <div className="h-2 bg-slate-800 rounded overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

interface ScoreBreakdownProps {
  factors: ReadonlyArray<{ factor: string; delta: number; note: string }>;
}

export function ScoreBreakdown({ factors }: ScoreBreakdownProps) {
  return (
    <div className="space-y-2">
      {factors.map((f, i) => (
        <div key={i} className="flex flex-col text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">{signalLabel(f.factor)}</span>
            <span
              className={`tabular-nums ${
                f.delta > 0
                  ? 'text-green-400'
                  : f.delta < 0
                    ? 'text-red-400'
                    : 'text-slate-400'
              }`}
            >
              {f.delta > 0 ? '+' : ''}
              {f.delta}
            </span>
          </div>
          {f.note && <span className="text-xs text-slate-500">{f.note}</span>}
        </div>
      ))}
    </div>
  );
}

interface ScoreChainProps {
  chain: string;
}

export function ScoreChain({ chain }: ScoreChainProps) {
  return (
    <Badge tone="white">
      <ChainIcon chain={chain} className="mr-1" />
      {chain === 'solana' ? 'Solana' : 'EVM'}
    </Badge>
  );
}
