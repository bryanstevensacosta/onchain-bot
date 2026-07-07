import { Card } from '@/shared/ui';
import {
  useQueue,
  useQueueCounts,
} from '@/features/crypto-news-publisher/model/use-queue';
import type { QueueEntryView } from '@/features/crypto-news-publisher/api/queue-api';

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const colorByStatus: Record<string, string> = {
    PENDING: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    SCHEDULED: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    PUBLISHING: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    PUBLISHED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    FAILED: 'bg-red-500/20 text-red-300 border-red-500/40',
  };
  const classes =
    colorByStatus[status] ??
    'bg-slate-500/20 text-slate-300 border-slate-500/40';
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-mono ${classes}`}
    >
      {status}
    </span>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

interface CounterCardProps {
  label: string;
  value: number;
  hint?: string;
}

function CounterCard({
  label,
  value,
  hint,
}: CounterCardProps): React.ReactElement {
  return (
    <Card>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-100 mt-1">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </Card>
  );
}

function QueueRow({ entry }: { entry: QueueEntryView }): React.ReactElement {
  return (
    <article className="rounded-lg bg-slate-800/50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-mono text-slate-300">{entry.channelId}</span>
        <span>·</span>
        <span>msg {entry.messageId}</span>
        <span>·</span>
        <StatusBadge status={entry.status} />
        <span>·</span>
        <span>attempts {entry.attempts}</span>
        <span>·</span>
        <span>received {formatTime(entry.messageReceivedAt)}</span>
        {entry.publishedAt && (
          <>
            <span>·</span>
            <span>published {formatTime(entry.publishedAt)}</span>
          </>
        )}
      </div>
      {entry.rawTitle && (
        <h4 className="text-sm font-semibold text-slate-100 mt-1">
          {entry.rawTitle}
        </h4>
      )}
      {entry.rawContent && (
        <p className="mt-2 text-sm text-slate-300 line-clamp-3 whitespace-pre-wrap">
          {entry.rawContent}
        </p>
      )}
      {entry.lastError && (
        <p className="mt-1 text-xs text-red-300 font-mono break-all">
          {entry.lastError}
        </p>
      )}
    </article>
  );
}

export function QueueView(): React.ReactElement {
  const queue = useQueue(50);
  const counts = useQueueCounts();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CounterCard label="Pending" value={counts.data?.pending ?? 0} />
        <CounterCard
          label="Published today"
          value={counts.data?.publishedToday ?? 0}
        />
        <CounterCard
          label="Remaining today"
          value={counts.data?.remaining ?? 0}
          hint={
            counts.data ? `Daily cap window resets at 04:00 UTC` : undefined
          }
        />
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Queue ({queue.data?.length ?? 0})
        </h2>
        {queue.isLoading ? (
          <div className="text-sm text-slate-500">Cargando...</div>
        ) : queue.error ? (
          <div className="text-sm text-red-400">
            Failed to load queue: {String(queue.error)}
          </div>
        ) : (queue.data ?? []).length === 0 ? (
          <div className="text-sm text-slate-500">
            Queue is empty — no messages waiting to publish.
          </div>
        ) : (
          <div className="space-y-2">
            {(queue.data ?? []).map((entry) => (
              <QueueRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
