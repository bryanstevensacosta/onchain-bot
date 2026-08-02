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
  BlockedPostsList,
  KeywordsManager,
  LlmConfigForm,
  PromptTemplates,
  QueueView,
} from '@/features/crypto-news-publisher';
import { useSearchPhrases } from '@/features/crypto-news-publisher/model/use-phrases';

interface LightboxMediaItem {
  id: string;
  url: string;
  alt: string;
}

export const TRUNCATION_LIMIT = 500;

export function CryptoNewsPage() {
  const messages = useCryptoNewsMessages(50);
  const sources = useCryptoNewsSources();
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [phraseSearch, setPhraseSearch] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<
    ReadonlyArray<LightboxMediaItem>
  >([]);
  const [msgPage, setMsgPage] = useState(0);
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);

  const phraseSearchResults = useSearchPhrases(phraseSearch);

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

  // Group consecutive messages sharing the same groupedId
  // (Telegram media albums sent as separate messages), then paginate
  // on the merged groups so each "page item" is one article.
  const messageGroups = useMemo(() => {
    const groups: (typeof filteredMessages)[number][] = [];
    let i = 0;
    while (i < filteredMessages.length) {
      const curr = filteredMessages[i];
      if (curr.groupedId) {
        let j = i + 1;
        while (
          j < filteredMessages.length &&
          filteredMessages[j].groupedId === curr.groupedId
        ) {
          j++;
        }
        if (j > i + 1) {
          const merged = {
            ...curr,
            content:
              curr.content ||
              filteredMessages.slice(i + 1, j).find((m) => m.content)
                ?.content ||
              '',
            media: filteredMessages.slice(i, j).flatMap((m) => m.media),
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
    return groups;
  }, [filteredMessages]);

  const msgPerPage = 10;
  const msgTotalPages = Math.max(
    1,
    Math.ceil(messageGroups.length / msgPerPage),
  );
  const msgSafePage = Math.min(msgPage, msgTotalPages - 1);
  const pagedGroups = messageGroups.slice(
    msgSafePage * msgPerPage,
    (msgSafePage + 1) * msgPerPage,
  );

  useEffect(() => {
    setMsgPage(0);
    setExpandedMsgId(null);
  }, [channelFilter, search]);
  useEffect(() => {
    setExpandedMsgId(null);
  }, [msgPage]);
  const _pagedMessages = filteredMessages.slice(
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

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-400">Search phrases:</label>
            <input
              type="search"
              value={phraseSearch}
              onChange={(e) => setPhraseSearch(e.target.value)}
              placeholder="Search keywords & blacklist…"
              aria-label="Search phrases by text"
              className="bg-slate-800 text-slate-100 text-sm rounded px-3 py-1.5 border border-slate-700 placeholder:text-slate-500 flex-1 min-w-[200px]"
            />
            {phraseSearch.trim().length > 0 && (
              <div className="text-xs text-slate-400">
                {phraseSearchResults.isLoading ? (
                  <span>Searching...</span>
                ) : phraseSearchResults.data ? (
                  <span>
                    Found {phraseSearchResults.data.length} phrase
                    {phraseSearchResults.data.length === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span>No results</span>
                )}
              </div>
            )}
          </div>

          {phraseSearch.trim().length > 0 &&
            phraseSearchResults.data &&
            phraseSearchResults.data.length > 0 && (
              <div className="mb-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="text-xs uppercase text-slate-500 mb-2">
                  Search Results
                </div>
                <div className="flex flex-wrap gap-2">
                  {phraseSearchResults.data.slice(0, 10).map((phrase) => (
                    <span
                      key={phrase.id}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                        phrase.table === 'keyword'
                          ? 'bg-blue-900/40 text-blue-300 border border-blue-800'
                          : 'bg-red-900/40 text-red-300 border border-red-800'
                      }`}
                    >
                      <span className="font-mono">{phrase.phrase}</span>
                      <span className="text-[10px] opacity-70">
                        {phrase.table === 'keyword' ? 'KW' : 'BL'}
                      </span>
                      {!phrase.enabled && (
                        <span className="text-slate-500" title="Disabled">
                          •
                        </span>
                      )}
                    </span>
                  ))}
                  {phraseSearchResults.data.length > 10 && (
                    <span className="text-xs text-slate-500 py-1">
                      +{phraseSearchResults.data.length - 10} more
                    </span>
                  )}
                </div>
              </div>
            )}

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
                {pagedGroups.map((msg) => {
                  const isExpanded = expandedMsgId === msg.id;
                  const isLong = msg.content.length > TRUNCATION_LIMIT;
                  return (
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
                              {m.type === 'video' ? (
                                <video
                                  key={m.url}
                                  controls
                                  className="h-auto w-full max-h-56 rounded object-contain bg-slate-900"
                                >
                                  <source src={m.url} type="video/mp4" />
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
                        {renderFormattedText(
                          isExpanded || !isLong
                            ? msg.content
                            : msg.content.slice(0, TRUNCATION_LIMIT),
                          msg.formattingEntities,
                        )}
                      </p>
                      {isLong && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 text-blue-400 hover:text-blue-300"
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpandedMsgId(isExpanded ? null : msg.id)
                          }
                        >
                          {isExpanded ? 'Show less' : 'Show more'}
                        </Button>
                      )}
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
                  );
                })}
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
            className="space-y-3 rounded-lg border border-red-900/50 bg-red-950/20 p-4"
          >
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-red-400 hover:text-red-300 select-none">
              Blocked
            </summary>
            <div className="pt-2">
              <BlockedPostsList />
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
