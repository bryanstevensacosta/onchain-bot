import { useMemo, useState } from 'react';
import { Button, Card, Modal } from '@/shared/ui';
import {
  useCancelQueueEntry,
  useQueue,
  useQueueCounts,
} from '@/features/crypto-news-publisher/model/use-queue';
import { useKeywords } from '@/features/crypto-news-publisher/model/use-keywords';
import type { QueueEntryView } from '@/features/crypto-news-publisher/api/queue-api';

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const colorByStatus: Record<string, string> = {
    PENDING: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    SCHEDULED: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    PUBLISHING: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    PUBLISHED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    FAILED: 'bg-red-500/20 text-red-300 border-red-500/40',
    BLOCKED: 'bg-red-500/20 text-red-300 border-red-500/40',
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

function telegramPostUrl(channelId: string, messageId: string): string {
  return `https://t.me/c/${channelId}/${messageId}`;
}

export function DetailsModal({
  entry,
  onClose,
}: {
  entry: QueueEntryView;
  onClose: () => void;
}): React.ReactElement {
  const { data: keywords } = useKeywords();
  const matchedKeywordNames = useMemo(() => {
    if (!entry.matchedKeywordIds?.length || !keywords?.length) return null;
    return entry.matchedKeywordIds
      .map((id) => keywords.find((k) => k.id === id)?.phrase)
      .filter(Boolean)
      .join(', ');
  }, [entry.matchedKeywordIds, keywords]);

  const modalTitle =
    entry.status === 'BLOCKED' ? 'Blocked Post Details' : 'Queue Entry Details';

  return (
    <Modal isOpen onClose={onClose} title={modalTitle} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Status + timestamps */}
        <section>
          <h3 className="text-xs uppercase text-slate-500 mb-2">Status</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={entry.status} />
            <span className="text-slate-400">
              · received {formatTime(entry.messageReceivedAt)}
            </span>
            {entry.publishedAt && (
              <span className="text-slate-400">
                · published {formatTime(entry.publishedAt)}
              </span>
            )}
          </div>
          {entry.status === 'BLOCKED' && entry.blockedReason && (
            <p className="mt-2 text-xs text-red-300 font-mono break-all whitespace-pre-wrap bg-red-900/50 rounded p-2">
              Blocked: {entry.blockedReason}
            </p>
          )}
          {/* Duplicate Reference for BLOCKED entries */}
          {entry.status === 'BLOCKED' &&
            (entry.duplicateOfChannelId || entry.duplicateOfMessageId) && (
              <p className="mt-2 text-xs text-amber-300 font-mono break-all whitespace-pre-wrap bg-amber-900/30 rounded p-2">
                Duplicate of:{' '}
                {entry.duplicateOfChannelId && entry.duplicateOfMessageId && (
                  <a
                    href={`https://t.me/c/${entry.duplicateOfChannelId}/${entry.duplicateOfMessageId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Telegram message ↗
                  </a>
                )}
                {(!entry.duplicateOfChannelId ||
                  !entry.duplicateOfMessageId) && (
                  <>
                    channel {entry.duplicateOfChannelId}, message{' '}
                    {entry.duplicateOfMessageId}
                  </>
                )}
                {entry.duplicateOfEntryId && (
                  <> (queue entry: {entry.duplicateOfEntryId})</>
                )}
              </p>
            )}
          {entry.lastError && (
            <p className="mt-2 text-xs text-red-300 font-mono break-all whitespace-pre-wrap">
              {entry.lastError}
            </p>
          )}
          {entry.telegramUrl && (
            <a
              href={entry.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 underline"
            >
              Open in Telegram ↗
            </a>
          )}
        </section>

        {/* Matched keywords */}
        {matchedKeywordNames && (
          <section>
            <h3 className="text-xs uppercase text-slate-500 mb-2">
              Matched Keywords
            </h3>
            <p className="text-sm text-amber-300">{matchedKeywordNames}</p>
          </section>
        )}

        {/* Raw input */}
        {entry.rawContent && (
          <section>
            <h3 className="text-xs uppercase text-slate-500 mb-2">
              Input (raw message)
            </h3>
            {entry.rawTitle && (
              <p className="text-sm font-semibold text-slate-200 mb-1">
                {entry.rawTitle}
              </p>
            )}
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans bg-slate-800/50 rounded p-2 max-h-40 overflow-y-auto">
              {entry.rawContent}
            </pre>
          </section>
        )}

        {/* Media (images/videos) */}
        {entry.imagePaths && entry.imagePaths.length > 0 && (
          <section>
            <h3 className="text-xs uppercase text-slate-500 mb-2">
              Media ({entry.imagePaths.length})
            </h3>
            <div
              className={`grid gap-1 ${
                entry.imagePaths.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
              }`}
            >
              {entry.imagePaths.map((path, idx) => {
                const isVideo =
                  path.endsWith('.bin') ||
                  path.endsWith('.mp4') ||
                  path.includes('/video_') ||
                  path.includes('/document');
                return isVideo ? (
                  <video
                    key={idx}
                    controls
                    className="h-auto w-full max-h-48 rounded object-contain bg-slate-900"
                  >
                    <source
                      src={`/crypto-news-publisher/queue/${entry.id}/media?index=${idx}`}
                      type="video/mp4"
                    />
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <img
                    key={idx}
                    src={`/crypto-news-publisher/queue/${entry.id}/media?index=${idx}`}
                    alt={`Media ${idx + 1}`}
                    className="h-auto w-full max-h-48 rounded object-contain bg-slate-900"
                    loading="lazy"
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Generated output */}
        {entry.generatedContent && (
          <section>
            <h3 className="text-xs uppercase text-slate-500 mb-2">
              Output (refined post)
            </h3>
            <pre className="text-sm text-emerald-300 whitespace-pre-wrap font-sans bg-slate-800/50 rounded p-2 max-h-40 overflow-y-auto">
              {entry.generatedContent}
            </pre>
          </section>
        )}

        {/* System prompt */}
        {entry.generatedSystemPrompt && (
          <section>
            <h3 className="text-xs uppercase text-slate-500 mb-2">
              System Prompt
            </h3>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans bg-slate-800/50 rounded p-2 max-h-32 overflow-y-auto">
              {entry.generatedSystemPrompt}
            </pre>
          </section>
        )}

        {/* User prompt */}
        {entry.generatedUserPrompt && (
          <section>
            <h3 className="text-xs uppercase text-slate-500 mb-2">
              User Prompt (LLM input)
            </h3>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans bg-slate-800/50 rounded p-2 max-h-40 overflow-y-auto">
              {entry.generatedUserPrompt}
            </pre>
          </section>
        )}

        {/* Generation params */}
        {(entry.generatedTemperature !== null ||
          entry.generatedReasoningEffort ||
          entry.generatedModel) && (
          <section>
            <h3 className="text-xs uppercase text-slate-500 mb-2">
              Generation Parameters
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {entry.generatedModel && (
                <div>
                  <span className="text-slate-400">Model:</span>{' '}
                  <span className="text-slate-200 font-mono text-xs">
                    {entry.generatedModel}
                  </span>
                </div>
              )}
              {entry.generatedTemperature !== null && (
                <div>
                  <span className="text-slate-400">Temperature:</span>{' '}
                  <span className="text-slate-200">
                    {entry.generatedTemperature}
                  </span>
                </div>
              )}
              {entry.generatedReasoningEffort && (
                <div>
                  <span className="text-slate-400">Reasoning effort:</span>{' '}
                  <span className="text-slate-200">
                    {entry.generatedReasoningEffort}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}

function QueueRow({ entry }: { entry: QueueEntryView }): React.ReactElement {
  const [showDetails, setShowDetails] = useState(false);
  const cancelMutation = useCancelQueueEntry();

  return (
    <>
      <article className="rounded-lg bg-slate-800/50 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {entry.sourceHandle ? (
            <a
              href={entry.telegramUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-400 hover:text-blue-300 underline"
            >
              @{entry.sourceHandle}
            </a>
          ) : (
            <span className="font-mono text-slate-300">{entry.channelId}</span>
          )}
          <span>·</span>
          <span>msg {entry.messageId}</span>
          <span>·</span>
          <StatusBadge status={entry.status} />
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
        {entry.imagePaths.length > 0 && (
          <div
            className={`mt-2 grid gap-1 ${entry.imagePaths.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
          >
            {entry.imagePaths.map((_, idx) => (
              <img
                key={idx}
                src={`/crypto-news-publisher/queue/${entry.id}/media?index=${idx}`}
                alt={`Media ${idx + 1}`}
                className="h-auto w-full max-h-48 rounded object-contain bg-slate-900"
                loading="lazy"
              />
            ))}
          </div>
        )}
        {entry.lastError && (
          <p className="mt-1 text-xs text-red-300 font-mono break-all">
            {entry.lastError}
          </p>
        )}
        {entry.status === 'BLOCKED' && entry.blockedReason && (
          <p className="mt-1 text-xs text-red-300 font-mono break-all">
            Blocked: {entry.blockedReason}
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails(true)}
          >
            Details
          </Button>
          {entry.status === 'PENDING' && (
            <Button
              variant="danger"
              size="sm"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (window.confirm('Cancel this queue entry?')) {
                  cancelMutation.mutate(entry.id);
                }
              }}
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Cancel'}
            </Button>
          )}
        </div>
      </article>
      {showDetails && (
        <DetailsModal entry={entry} onClose={() => setShowDetails(false)} />
      )}
    </>
  );
}

export function QueueView(): React.ReactElement {
  const queue = useQueue(50);
  const counts = useQueueCounts();
  const [page, setPage] = useState(0);
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
          <>
            <div className="space-y-2">
              {pageEntries.map((entry) => (
                <QueueRow key={entry.id} entry={entry} />
              ))}
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
    </div>
  );
}
