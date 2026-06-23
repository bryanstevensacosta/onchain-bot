import type { TokenScoreView } from '../model/types';
import { Badge, ChainIcon } from '@/shared/ui';
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

const FACTOR_LABELS: Record<string, string> = {
  LIQUIDITY_HIGH: 'High Liquidity',
  LIQUIDITY_MEDIUM: 'Medium Liquidity',
  LIQUIDITY_LOW: 'Low Liquidity',
  LIQUIDITY_INSUFFICIENT: 'Insufficient Liquidity',
  HOLDERS_HIGH: 'High Holders',
  HOLDERS_MEDIUM: 'Medium Holders',
  HOLDERS_LOW: 'Low Holders',
  HOLDERS_NONE: 'No Holders',
  MC_HIGH: 'High Market Cap',
  MC_MEDIUM: 'Medium Market Cap',
  MC_LOW: 'Low Market Cap',
  VOLUME_HIGH: 'High Volume',
  VOLUME_LOW: 'Low Volume',
  MULTI_CHANNEL_BUZZ: 'Multi-Channel Buzz',
  TWO_CHANNELS: 'Two Channels',
  HIGH_MENTION_COUNT: 'High Mentions',
  MULTIPLE_MENTIONS: 'Multiple Mentions',
  SIGNAL_HONEYPOT: 'Honeypot Risk',
  SIGNAL_BLACKLIST: 'Blacklist Risk',
  CHANNEL_REPUTATION: 'Channel Reputation',
  SECURITY_FLAG_CAP: 'Security Cap',
};

export function ScoreBreakdown({ factors }: ScoreBreakdownProps) {
  return (
    <div className="space-y-2">
      {factors.map((f, i) => (
        <div key={i} className="flex flex-col text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">
              {FACTOR_LABELS[f.factor] || f.factor}
            </span>
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
