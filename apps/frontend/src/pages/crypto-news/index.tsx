import { useState } from 'react';
import { useCryptoNewsMessages, useCryptoNewsSources } from '@/entities/crypto-news';
import { Card } from '@/shared/ui';
import { formatRelativeTime } from '@/shared/lib';

export function CryptoNewsPage() {
  const messages = useCryptoNewsMessages(50);
  const sources = useCryptoNewsSources();
  const [channelFilter, setChannelFilter] = useState<string>('');

  const filteredMessages = channelFilter
    ? (messages.data ?? []).filter((m) => m.channelId === channelFilter)
    : messages.data ?? [];

  return (
    <div className="px-6 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">📰 Crypto News</h1>
        <p className="text-sm text-slate-400 mt-1">
          Ingested messages from monitored crypto-news Telegram channels.
        </p>
      </header>

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
          <div className="text-xs uppercase text-slate-500">Messages (50 most recent)</div>
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
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Recent messages</h2>
        {messages.isLoading ? (
          <div className="text-slate-500">Cargando...</div>
        ) : messages.error ? (
          <div className="text-red-400 text-sm">Error: {String(messages.error)}</div>
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
                  <span className="font-mono">{msg.channelId}</span>
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
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
