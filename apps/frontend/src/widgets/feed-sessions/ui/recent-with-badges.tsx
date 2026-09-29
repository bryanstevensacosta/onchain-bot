import { useEffect, useState } from 'react';
import { Badge } from '@/shared/ui/badge';
import {
  badgeTone,
  useMessageStatus,
  useProfileRecentMessages,
  type MessageStatusView,
} from '@/entities/feed-session';

function StatusBadge({
  channelId,
  messageId,
}: {
  channelId: string;
  messageId: number;
}): React.ReactElement {
  const { data, isLoading, error } = useMessageStatus(channelId, messageId);
  if (isLoading) {
    return (
      <span
        data-testid={`status-badge-${channelId}-${messageId}`}
        className="text-xs text-slate-500"
      >
        …
      </span>
    );
  }
  if (error || !data) return <span className="text-xs text-slate-600">—</span>;
  return (
    <Badge tone={badgeTone(data.badge)}>
      <span data-testid={`status-badge-${channelId}-${messageId}`}>
        {data.badge}
      </span>
    </Badge>
  );
}

function DetailsModal({
  status,
  content,
  onClose,
}: {
  status: MessageStatusView | null;
  content: string;
  onClose: () => void;
}): React.ReactElement | null {
  useEffect(() => {
    if (status === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [status, onClose]);

  if (status === null) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="recent-details-modal"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        data-testid="recent-details-body"
        className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-lg mx-4 p-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-100">
            {status.channelId}:{status.messageId}
          </h3>
          <Badge tone={badgeTone(status.badge)}>{status.badge}</Badge>
        </div>
        <p className="text-sm text-slate-200 whitespace-pre-wrap">{content}</p>
        {status.reasons.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {status.reasons.map((reason) => (
              <li key={reason} className="text-xs text-slate-400">
                {reason}
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 text-xs px-2 py-1 rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function RecentWithBadges(): React.ReactElement {
  const { data: messages, isLoading, error } = useProfileRecentMessages(20);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const openMessage = (messages ?? []).find(
    (m) => `${m.channelId}:${m.messageId}` === openKey,
  );
  const { data: openStatus } = useMessageStatus(
    openMessage?.channelId ?? '',
    openMessage?.messageId ?? 0,
    openMessage !== undefined,
  );

  if (isLoading) return <p className="text-slate-400 py-2">Loading recent…</p>;
  if (error || !messages)
    return <p className="text-slate-500 py-2">Recent unavailable.</p>;

  return (
    <section aria-label="Recent messages" className="py-3">
      <h2 className="text-sm font-semibold text-slate-300 mb-2">Recent</h2>
      <ul data-testid="recent-list" className="space-y-1.5">
        {messages.map((m) => {
          const key = `${m.channelId}:${m.messageId}`;
          return (
            <li
              key={key}
              className="flex items-start gap-2 rounded bg-slate-900/60 px-2 py-1.5"
            >
              <p
                data-testid={`recent-item-${m.channelId}-${m.messageId}`}
                className="line-clamp-3 flex-1 text-sm text-slate-300"
              >
                {m.content}
              </p>
              <StatusBadge channelId={m.channelId} messageId={m.messageId} />
              <button
                data-testid={`recent-open-${m.channelId}-${m.messageId}`}
                type="button"
                onClick={() => setOpenKey(key)}
                className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-200 hover:bg-slate-600 shrink-0"
              >
                Details
              </button>
            </li>
          );
        })}
      </ul>
      <DetailsModal
        status={openStatus ?? null}
        content={openMessage?.content ?? ''}
        onClose={() => setOpenKey(null)}
      />
    </section>
  );
}
