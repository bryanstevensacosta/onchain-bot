import { useFeedQueueStats } from '@/features/feed-publisher/model/use-queue';

/**
 * Feed-publisher queue stats strip (Tramo 2, todo 9):
 * per-status depth + tick health from GET /feed-api/api/queue/stats.
 * Hides on error (API down → nothing rendered, legacy counts stay).
 */
export function FeedQueueStatsStrip(): React.ReactElement | null {
  const { data, isLoading, error } = useFeedQueueStats();

  if (isLoading || error || !data) {
    return null;
  }

  const cells: ReadonlyArray<readonly [string, number]> = [
    ['Pending', data.pending],
    ['Scheduled', data.scheduled],
    ['Publishing', data.publishing],
    ['Published', data.published],
    ['Failed', data.failed],
    ['Blocked', data.blocked],
    ['Total', data.total],
  ];

  return (
    <div
      data-testid="feed-queue-stats"
      className="grid grid-cols-4 md:grid-cols-7 gap-2"
    >
      {cells.map(([label, value]) => (
        <div
          key={label}
          className="rounded bg-slate-800/50 px-2 py-1.5 text-center"
        >
          <div className="text-[10px] uppercase text-slate-500">{label}</div>
          <div className="text-lg font-bold text-slate-100">{value}</div>
        </div>
      ))}
    </div>
  );
}
