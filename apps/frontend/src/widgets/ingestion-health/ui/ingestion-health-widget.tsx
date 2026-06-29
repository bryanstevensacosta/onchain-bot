import { useQuery } from '@tanstack/react-query';
import { fetchIngestionHealth } from '../api/ingestion-health-queries';
import { Card, CardTitle } from '@/shared/ui';

function progressColor(ratio: number): string {
  if (ratio >= 0.9) return 'bg-red-500';
  if (ratio >= 0.7) return 'bg-orange-400';
  return 'bg-green-400';
}

function progressBgColor(ratio: number): string {
  if (ratio >= 0.9) return 'bg-red-900/30';
  if (ratio >= 0.7) return 'bg-orange-900/30';
  return 'bg-green-900/30';
}

export function IngestionHealthWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ingestion-health'],
    queryFn: fetchIngestionHealth,
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <Card>
        <div className="text-slate-400 text-sm">
          Loading ingestion health...
        </div>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardTitle>📡 Ingestion Health</CardTitle>
        <div className="text-red-400 text-sm mt-2">Offline</div>
      </Card>
    );
  }

  const ratio =
    data.maxSafeChannels > 0 ? data.activeChannels / data.maxSafeChannels : 0;
  const ratioPercent = Math.round(ratio * 100);

  return (
    <Card>
      <CardTitle>📡 Ingestion Health</CardTitle>
      <div className="space-y-3 mt-3">
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>
              Channels: {data.activeChannels} / {data.maxSafeChannels}
            </span>
            <span>{ratioPercent}%</span>
          </div>
          <div className={`h-2 rounded-full ${progressBgColor(ratio)}`}>
            <div
              className={`h-2 rounded-full ${progressColor(ratio)} transition-all`}
              style={{ width: `${Math.min(ratioPercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-slate-400">FLOOD_WAIT (24h)</span>
          <span
            className={
              data.floodWaitCount24h > 5
                ? 'text-red-400 font-bold'
                : 'text-slate-100'
            }
          >
            {data.floodWaitCount24h}
            {data.floodWaitMaxSeconds24h > 0 &&
              ` · max ${data.floodWaitMaxSeconds24h}s`}
          </span>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Sleep window</span>
          <span>{data.isSleeping ? '🌙 Active' : '☀️ Awake'}</span>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Last poll</span>
          <span className="text-slate-100">{data.lastPollAt ?? 'Never'}</span>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Poll interval</span>
          <span className="text-slate-100">
            {(data.pollIntervalMs / 1000).toFixed(0)}s ±30%
          </span>
        </div>
      </div>
    </Card>
  );
}
