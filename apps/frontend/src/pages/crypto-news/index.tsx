import { useEffect, useMemo, useState } from 'react';
import {
  useCryptoNewsMessages,
  useCryptoNewsSources,
} from '@/entities/crypto-news';
import { Button, Card } from '@/shared/ui';
import { Lightbox } from '@/shared/ui/lightbox';
import { formatRelativeTime } from '@/shared/lib';
import { renderFormattedText } from '@/shared/lib/render-telegram-entities';
import { AddCryptoNewsSourceModal } from '@/features/add-crypto-news-source';
import {
  KeywordsManager,
  LlmConfigForm,
  PromptTemplates,
  QueueView,
} from '@/features/crypto-news-publisher';

interface LightboxMediaItem {
  id: string;
  url: string;
  alt: string;
}

export function CryptoNewsPage() {
  const messages = useCryptoNewsMessages(50);
  const sources = useCryptoNewsSources();
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<
    ReadonlyArray<LightboxMediaItem>
  >([]);
  const [msgPage, setMsgPage] = useState(0);

  const sourceByChannelId = useMemo(
    () => new Map((sources.data ?? []).map((s) => [s.channelId, s])),
    [sources.data],
  );

  const filteredMessages = useMemo(() => {
    const all = messages.data ?? [];
    const needle = search.trim().toLowerCase();
    return all.filter((m) => {
      if (channelFilter && m.channelId !== channelFilter) return false;
      if (needle) {
        const haystack = `${m.title ?? ''}\n${m.content}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [messages.data, channelFilter, search]);

  const msgPerPage = 10;
  const msgTotalPages = Math.max(
    1,
    Math.ceil(filteredMessages.length / msgPerPage),
  );
  const msgSafePage = Math.min(msgPage, msgTotalPages - 1);

  useEffect(() => {
    setMsgPage(0);
  }, [channelFilter, search]);
  const pagedMessages = filteredMessages.slice(
    msgSafePage * msgPerPage,
    (msgSafePage + 1) * msgPerPage,
  );

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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6 lg:col-span-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <div className="text-xs uppercase text-slate-500">
                Active sources
              </div>
              <div className="text-2xl font-bold text-slate-100 mt-1">
                {(sources.data ?? []).filter((s) => s.isActive).length}
              </div>
            </Card>
            <Card>
              <div className="text-xs uppercase text-slate-500">
                Total sources
              </div>
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

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-400">Filter by source:</label>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="bg-slate-800 text-slate-100 text-sm rounded px-3 py-1.5 border border-slate-700"
            >
              <option value="">All sources</option>
              {(sources.data ?? []).map((s) => (
                <option key={s.channelId} value={s.channelId}>
                  {s.title}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages…"
              aria-label="Search messages by text"
              className="bg-slate-800 text-slate-100 text-sm rounded px-3 py-1.5 border border-slate-700 placeholder:text-slate-500"
            />
          </div>

          <details
            open
            className="rounded-lg border border-slate-700 bg-slate-800/30 p-4"
          >
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 select-none mb-4">
              Recent messages
            </summary>
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
                {(() => {
                  // Group N consecutive messages sharing the same groupedId
                  // (Telegram media albums are sent as separate messages)
                  const groups: (typeof pagedMessages)[number][] = [];
                  let i = 0;
                  while (i < pagedMessages.length) {
                    const curr = pagedMessages[i];
                    if (curr.groupedId) {
                      let j = i + 1;
                      while (
                        j < pagedMessages.length &&
                        pagedMessages[j].groupedId === curr.groupedId
                      ) {
                        j++;
                      }
                      if (j > i + 1) {
                        // Merge messages[i..j-1] into one
                        const merged = {
                          ...curr,
                          content:
                            curr.content ||
                            pagedMessages
                              .slice(i + 1, j)
                              .find((m) => m.content)?.content ||
                            '',
                          media: pagedMessages
                            .slice(i, j)
                            .flatMap((m) => m.media),
                          groupedId: null,
                        };
                        groups.push(merged);
                        i = j;
                      } else {
                        groups.push(curr);
                        i += 1;
                      }
                    } else {
                      groups.push(curr);
                      i += 1;
                    }
                  }
                  return groups.map((msg) => (
                    <article
                      key={msg.id}
                      className="rounded-xl bg-slate-800/50 p-4 text-left"
                    >
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {(() => {
                          const source = sourceByChannelId.get(msg.channelId);
                          if (!source) {
                            return (
                              <span className="font-mono">{msg.channelId}</span>
                            );
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
                      {msg.media && msg.media.length > 0 && (
                        <div
                          className={`mt-3 grid gap-1 ${
                            msg.media.length === 1
                              ? 'grid-cols-1'
                              : 'grid-cols-2'
                          }`}
                        >
                          {msg.media.map((m, idx) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setLightboxIndex(idx);
                                setLightboxMedia(
                                  msg.media.map((media, mediaIdx) => ({
                                    id: media.id,
                                    url: media.url,
                                    alt: `${msg.title ?? 'image'} ${mediaIdx + 1}`,
                                  })),
                                );
                              }}
                              className="block w-full text-left"
                            >
                              {m.mimeType?.startsWith('video/') ? (
                                <video
                                  key={m.url}
                                  controls
                                  className="h-auto w-full max-h-56 rounded object-contain bg-slate-900"
                                >
                                  <source
                                    src={m.url}
                                    type={m.mimeType ?? 'video/mp4'}
                                  />
                                  Your browser does not support video playback.
                                </video>
                              ) : (
                                <img
                                  src={m.url}
                                  alt={`${msg.title ?? 'image'} ${idx + 1}`}
                                  className="h-auto w-full max-h-56 rounded object-contain cursor-pointer transition-opacity hover:opacity-80"
                                  loading="lazy"
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">
                        {msg.content.length > 500
                          ? renderFormattedText(
                              msg.content.slice(0, 500),
                              msg.formattingEntities,
                            )
                          : renderFormattedText(
                              msg.content,
                              msg.formattingEntities,
                            )}
                      </p>
                      {msg.linkPreviewUrl && (
                        <a
                          href={msg.linkPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 block rounded border border-slate-700 bg-slate-800 p-3 hover:border-slate-500 transition-colors"
                        >
                          {msg.linkPreviewTitle && (
                            <h4 className="text-sm font-semibold text-slate-100">
                              {msg.linkPreviewTitle}
                            </h4>
                          )}
                          {msg.linkPreviewDescription && (
                            <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                              {msg.linkPreviewDescription}
                            </p>
                          )}
                          {msg.linkPreviewSiteName && (
                            <p className="mt-1 text-xs text-slate-500">
                              {msg.linkPreviewSiteName}
                            </p>
                          )}
                          <span className="mt-1 block text-xs text-blue-400">
                            {msg.linkPreviewUrl}
                          </span>
                        </a>
                      )}
                    </article>
                  ));
                })()}
              </div>
            )}
            {msgTotalPages > 1 && (
              <div className="flex items-center justify-between pt-4 text-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={msgSafePage === 0}
                  onClick={() => setMsgPage((p) => Math.max(0, p - 1))}
                >
                  ‹ Previous
                </Button>
                <span className="text-slate-400">
                  {msgSafePage + 1} / {msgTotalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={msgSafePage >= msgTotalPages - 1}
                  onClick={() =>
                    setMsgPage((p) => Math.min(msgTotalPages - 1, p + 1))
                  }
                >
                  Next ›
                </Button>
              </div>
            )}
          </details>

          {lightboxIndex !== null && (
            <Lightbox
              images={lightboxMedia}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </div>

        <aside className="space-y-4 lg:col-span-1 lg:sticky lg:top-4">
          <details
            open
            className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4"
          >
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 select-none">
              Keywords
            </summary>
            <div className="pt-2">
              <KeywordsManager />
            </div>
          </details>

          <details
            open
            className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4"
          >
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 select-none">
              Queue
            </summary>
            <div className="pt-2">
              <QueueView />
            </div>
          </details>

          <details
            open
            className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4"
          >
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 select-none">
              LLM Configuration
            </summary>
            <div className="space-y-4 pt-2">
              <LlmConfigForm />
              <PromptTemplates />
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
