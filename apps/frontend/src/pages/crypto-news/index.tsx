import { useMemo, useState } from 'react';
import {
  useCryptoNewsMessages,
  useCryptoNewsSources,
} from '@/entities/crypto-news';
import { Button, Card } from '@/shared/ui';
import { formatRelativeTime } from '@/shared/lib';
import { AddCryptoNewsSourceModal } from '@/features/add-crypto-news-source';

export function CryptoNewsPage() {
  const messages = useCryptoNewsMessages(50);
  const sources = useCryptoNewsSources();
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);

  const sourceByChannelId = useMemo(
    () => new Map((sources.data ?? []).map((s) => [s.channelId, s])),
    [sources.data],
  );

  const filteredMessages = channelFilter
    ? (messages.data ?? []).filter((m) => m.channelId === channelFilter)
    : (messages.data ?? []);

  return (
    <div className="px-6 py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">Crypto News</h1>
          <p className="text-sm text-slate-400 mt-1">
            Ingested messages from monitored crypto-news Telegram channels.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowAddModal(true)}
        >
          + Add Source
        </Button>
      </header>

      <AddCryptoNewsSourceModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-xs uppercase text-slate-500">Active sources</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">
            {(sources.data ?? []).filter((s) => s.isActive).length}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Total sources</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">
            {(sources.data ?? []).length}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">
            Messages (50 most recent)
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-1">
            {(messages.data ?? []).length}
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-400">Filter by source:</label>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="bg-slate-800 text-slate-100 text-sm rounded px-3 py-1.5 border border-slate-700"
        >
          <option value="">All sources</option>
          {(sources.data ?? []).map((s) => (
            <option key={s.channelId} value={s.channelId}>
              {s.title} ({s.channelId})
            </option>
          ))}
        </select>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Recent messages
        </h2>
        {messages.isLoading ? (
          <div className="text-slate-500">Cargando...</div>
        ) : messages.error ? (
          <div className="text-red-400 text-sm">
            Error: {String(messages.error)}
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="text-slate-500 text-sm">No messages yet.</div>
        ) : (
          <div className="space-y-3">
            {filteredMessages.map((msg) => (
              <article
                key={msg.id}
                className="border-b border-slate-800 pb-3 last:border-b-0"
              >
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {(() => {
                    const source = sourceByChannelId.get(msg.channelId);
                    if (!source) {
                      return <span className="font-mono">{msg.channelId}</span>;
                    }
                    const displayName =
                      source.handle?.replace(/^@/, '') ??
                      source.title ??
                      msg.channelId;
                    const cleanHandle =
                      source.handle?.replace(/^@/, '') ?? null;
                    const telegramUrl = cleanHandle
                      ? `https://t.me/${cleanHandle}/${msg.messageId}`
                      : `https://t.me/c/${msg.channelId}/${msg.messageId}`;
                    return (
                      <a
                        href={telegramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-blue-400 hover:text-blue-300 underline"
                      >
                        {displayName}
                      </a>
                    );
                  })()}
                  <span>·</span>
                  <span>msg {msg.messageId}</span>
                  <span>·</span>
                  <span>{formatRelativeTime(msg.ingestedAt)}</span>
                </div>
                {msg.title && (
                  <h3 className="text-sm font-semibold text-slate-100 mt-1">
                    {msg.title}
                  </h3>
                )}
                <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">
                  {msg.content.length > 500
                    ? `${msg.content.slice(0, 500)}…`
                    : msg.content}
                </p>
                {msg.media?.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {msg.media.map((m) => (
                      <img
                        key={m.id}
                        src={m.url}
                        alt={`${msg.title ?? 'image'} ${m.index + 1}`}
                        className="h-auto max-h-96 w-full rounded-lg object-cover"
                        loading="lazy"
                      />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
