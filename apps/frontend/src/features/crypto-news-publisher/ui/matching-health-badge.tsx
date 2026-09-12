import { useMatchingHealth } from '@/features/crypto-news-publisher/model/use-llm-config';
import { formatRelativeTime } from '@/shared/lib';

export function MatchingHealthBadge(): React.ReactElement {
  const { data, isLoading, isError } = useMatchingHealth();

  if (isLoading && !data) {
    return (
      <div
        data-testid="matching-health-loading"
        className="h-6 w-48 animate-pulse rounded-full bg-slate-700/60"
        aria-label="Loading matching health"
      />
    );
  }

  if (isError || !data) {
    return (
      <span
        data-testid="matching-health-unknown"
        title="Health endpoint unavailable — scheduler state unknown (old backend may 404 /crypto-news/matching/health)"
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-700/60 px-2.5 py-0.5 text-xs font-medium text-slate-300"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
        UNKNOWN
      </span>
    );
  }

  const failures = data.consecutiveFetchFailures ?? 0;
  if (failures > 0) {
    return (
      <span
        data-testid="matching-health-unknown"
        title={`consecutiveFetchFailures: ${failures}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-700/60 px-2.5 py-0.5 text-xs font-medium text-slate-300"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
        UNKNOWN
      </span>
    );
  }

  if (!data.enabled) {
    return (
      <span
        data-testid="matching-health-off"
        title={
          data.lastTickAt
            ? `last tick ${formatRelativeTime(data.lastTickAt)}`
            : 'scheduler has not ticked yet'
        }
        className="inline-flex items-center gap-1.5 rounded-full bg-red-900/60 px-2.5 py-0.5 text-xs font-medium text-red-300"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
        OFF
        {data.lastTickAt && (
          <span className="text-red-400/80">
            · {formatRelativeTime(data.lastTickAt)}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      data-testid="matching-health-on"
      title={
        data.lastTickAt
          ? `last tick ${formatRelativeTime(data.lastTickAt)}`
          : 'scheduler has not ticked yet'
      }
      className="inline-flex items-center gap-1.5 rounded-full bg-green-900/60 px-2.5 py-0.5 text-xs font-medium text-green-300"
    >
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
      ON
      {data.lastTickAt && (
        <span className="text-green-400/80">
          · {formatRelativeTime(data.lastTickAt)}
        </span>
      )}
    </span>
  );
}
