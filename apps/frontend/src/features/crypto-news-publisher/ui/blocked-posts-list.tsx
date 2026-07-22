import { useState } from 'react';
import { Button, Card } from '@/shared/ui';
import { useQueue } from '@/features/crypto-news-publisher/model/use-queue';
import type { QueueEntryView } from '@/features/crypto-news-publisher/api/queue-api';
import { DetailsModal } from '@/features/crypto-news-publisher/ui/queue-view';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function truncateText(text: string | null, maxLength = 50): string {
  if (!text) return '—';
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

interface BlockedPostRowProps {
  entry: QueueEntryView;
  onSelect: (entry: QueueEntryView) => void;
}

function BlockedPostRow({
  entry,
  onSelect,
}: BlockedPostRowProps): React.ReactElement {
  return (
    <tr
      className="border-b border-slate-700/50 cursor-pointer hover:bg-slate-800/40 transition-colors"
      onClick={() => onSelect(entry)}
    >
      <td className="py-3 px-2 text-xs font-mono text-slate-300 whitespace-nowrap">
        {entry.channelId}
      </td>
      <td className="py-3 px-2 text-xs font-mono text-slate-300 whitespace-nowrap">
        {entry.messageId}
      </td>
      <td className="py-3 px-2 text-xs text-slate-300 max-w-[200px] truncate">
        {truncateText(entry.rawTitle)}
      </td>
      <td className="py-3 px-2 text-xs text-red-300 font-mono max-w-[250px] truncate">
        {entry.blockedReason ?? 'No reason'}
      </td>
      <td className="py-3 px-2 text-xs text-slate-400 whitespace-nowrap">
        {formatTime(entry.messageReceivedAt)}
      </td>
    </tr>
  );
}

export function BlockedPostsList(): React.ReactElement {
  const queue = useQueue(50, 'BLOCKED');
  const [page, setPage] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<QueueEntryView | null>(
    null,
  );
  const perPage = 5;

  const entries = queue.data ?? [];
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageEntries = entries.slice(
    safePage * perPage,
    (safePage + 1) * perPage,
  );

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold text-red-300 mb-4">
          Blocked Posts ({queue.data?.length ?? 0})
        </h2>
        {queue.isLoading ? (
          <div className="text-sm text-slate-500">Cargando...</div>
        ) : queue.error ? (
          <div className="text-sm text-red-400">
            Failed to load blocked posts: {String(queue.error)}
          </div>
        ) : (queue.data ?? []).length === 0 ? (
          <div className="text-sm text-slate-500">No blocked posts found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="py-2 px-2 text-xs font-semibold text-slate-400 uppercase">
                      Channel
                    </th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-400 uppercase">
                      Msg ID
                    </th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-400 uppercase">
                      Title
                    </th>
                    <th className="py-2 px-2 text-xs font-semibold text-red-400 uppercase">
                      Blocked Reason
                    </th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-400 uppercase">
                      Received At
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageEntries.map((entry) => (
                    <BlockedPostRow
                      key={entry.id}
                      entry={entry}
                      onSelect={setSelectedEntry}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 text-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ‹ Previous
                </Button>
                <span className="text-slate-400">
                  {safePage + 1} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={safePage >= totalPages - 1}
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                >
                  Next ›
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      {selectedEntry && (
        <DetailsModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
