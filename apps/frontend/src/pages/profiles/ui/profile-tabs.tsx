import { useMemo, useState } from 'react';
import { Badge } from '@/shared/ui/badge';
import { FeedQueueStatsStrip } from '@/features/feed-publisher/ui/feed-queue-stats-strip';
import {
  paginate,
  splitKeywordGroups,
  useChannelFilters,
  useFiltersPreview,
  useProfileLlm,
  useProfileQueue,
  useProfileRecentMessages,
  useProfileSources,
  usePublisherBlacklist,
  usePublisherKeywords,
  useToggleChannelFilter,
  useToggleProfileSource,
  useUpdateProfile,
  type ProfileView,
  type PublisherBlacklistView,
  type PublisherKeywordView,
} from '@/entities/profile';
import type { ProfileTab } from '../index';

const PAGE_SIZE = 5;

function SourcesTab({ profile }: { profile: ProfileView }): React.ReactElement {
  const { data: sources, isLoading, error } = useProfileSources();
  const toggle = useToggleProfileSource();

  if (isLoading) return <p className="text-slate-400 py-2">Loading sources…</p>;
  if (error || !sources) {
    return <p className="text-slate-500 py-2">Sources unavailable.</p>;
  }
  return (
    <div data-testid="sources-tab" className="py-3">
      <p className="text-xs text-slate-500 mb-2">
        Global sources with per-profile toggles (toggles only — no sources are
        created here).
      </p>
      <ul className="space-y-1.5">
        {sources.map((s) => {
          const on = profile.sourceToggles[s.channelId] ?? false;
          return (
            <li
              key={s.channelId}
              className="flex items-center gap-2 text-sm text-slate-300 rounded bg-slate-900/60 px-2 py-1.5"
            >
              <span className="flex-1 truncate">
                {s.title}
                <span className="text-slate-500"> · {s.channelId}</span>
              </span>
              <button
                data-testid={`source-toggle-${s.channelId}`}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() =>
                  toggle.mutate({
                    id: profile.id,
                    sourceId: s.channelId,
                    enabled: !on,
                  })
                }
                className={`text-xs px-2 py-1 rounded ${
                  on
                    ? 'bg-green-700 text-green-100'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {on ? 'On' : 'Off'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PaginatedTable({
  testPrefix,
  rows,
  renderRow,
}: {
  testPrefix: string;
  rows: ReadonlyArray<{ id: string; phrase: string }>;
  renderRow: (row: { id: string; phrase: string }) => React.ReactNode;
}): React.ReactElement {
  const [page, setPage] = useState(1);
  const paged = useMemo(() => paginate(rows, page, PAGE_SIZE), [rows, page]);
  return (
    <div>
      <ul className="space-y-1">
        {paged.pageItems.map((row) => (
          <li
            key={row.id}
            className="text-sm text-slate-300 rounded bg-slate-900/60 px-2 py-1"
          >
            {renderRow(row)}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 mt-1.5">
        <button
          data-testid={`${testPrefix}-prev`}
          type="button"
          disabled={paged.page <= 1}
          onClick={() => setPage(paged.page - 1)}
          className="text-xs px-2 py-1 rounded bg-slate-700 disabled:opacity-40"
        >
          Prev
        </button>
        <span
          data-testid={`${testPrefix}-page`}
          className="text-xs text-slate-500"
        >
          {paged.page}/{paged.totalPages} · {paged.total}
        </span>
        <button
          data-testid={`${testPrefix}-next`}
          type="button"
          disabled={paged.page >= paged.totalPages}
          onClick={() => setPage(paged.page + 1)}
          className="text-xs px-2 py-1 rounded bg-slate-700 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function KeywordsTab(): React.ReactElement {
  const keywords = usePublisherKeywords();
  const blacklist = usePublisherBlacklist();

  const allowed: ReadonlyArray<PublisherKeywordView> = useMemo(
    () => (keywords.data ?? []).filter((k) => k.andGroupId === null),
    [keywords.data],
  );
  const blocked: ReadonlyArray<PublisherBlacklistView> = useMemo(
    () => blacklist.data ?? [],
    [blacklist.data],
  );
  const compound = useMemo(
    () => splitKeywordGroups(keywords.data ?? []),
    [keywords.data],
  );

  if (keywords.isLoading || blacklist.isLoading) {
    return <p className="text-slate-400 py-2">Loading keywords…</p>;
  }
  if (keywords.error || blacklist.error) {
    return <p className="text-slate-500 py-2">Keywords unavailable.</p>;
  }
  return (
    <div data-testid="keywords-tab" className="py-3 space-y-4">
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-1.5">
          Allowed keywords
        </h3>
        <div data-testid="keywords-allowed-table">
          <PaginatedTable
            testPrefix="keywords-allowed"
            rows={allowed}
            renderRow={(row) => row.phrase}
          />
        </div>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-1.5">
          Blocked phrases
        </h3>
        <div data-testid="keywords-blocked-table">
          <PaginatedTable
            testPrefix="keywords-blocked"
            rows={blocked}
            renderRow={(row) => row.phrase}
          />
        </div>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-1.5">
          Compound AND-groups
        </h3>
        <div data-testid="keywords-compound-table">
          {compound.compound.length === 0 ? (
            <p className="text-xs text-slate-500">No compound groups.</p>
          ) : (
            compound.compound.map((group) => (
              <div key={group.groupId} className="mb-2">
                <p className="text-xs text-slate-500 mb-1">
                  group {group.groupId}
                </p>
                <PaginatedTable
                  testPrefix={`keywords-compound-${group.groupId}`}
                  rows={group.rows}
                  renderRow={(row) => row.phrase}
                />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function QueueTab({ profile }: { profile: ProfileView }): React.ReactElement {
  const { data: entries, isLoading, error } = useProfileQueue(50);
  const matching = profile.keywordIds.length;

  if (isLoading) return <p className="text-slate-400 py-2">Loading queue…</p>;
  return (
    <div data-testid="queue-tab" className="py-3 space-y-3">
      <FeedQueueStatsStrip />
      {error || !entries ? (
        <p className="text-slate-500 py-2">Queue unavailable.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {matching} profile keyword(s) bound · {entries.length} entries
          </p>
          <ul className="space-y-1">
            {entries.map((e) => (
              <li
                key={e.id}
                data-testid={`queue-entry-${e.id}`}
                className="flex items-center gap-2 text-sm text-slate-300 rounded bg-slate-900/60 px-2 py-1.5"
              >
                <span className="flex-1 truncate">
                  {e.channelId}:{e.messageId}
                </span>
                <Badge
                  tone={
                    e.status === 'PUBLISHED'
                      ? 'green'
                      : e.status === 'FAILED'
                        ? 'red'
                        : e.status === 'BLOCKED'
                          ? 'amber'
                          : 'gray'
                  }
                >
                  {e.status}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TargetTab({ profile }: { profile: ProfileView }): React.ReactElement {
  const update = useUpdateProfile();

  function flip(
    key: 'matchingEnabled' | 'publishingEnabled' | 'llmEnabled',
    value: boolean,
  ) {
    update.mutate({ id: profile.id, body: { [key]: value } });
  }

  const switches: ReadonlyArray<{
    key: 'matchingEnabled' | 'publishingEnabled' | 'llmEnabled';
    label: string;
    value: boolean;
  }> = [
    {
      key: 'matchingEnabled',
      label: 'Matching',
      value: profile.matchingEnabled,
    },
    {
      key: 'publishingEnabled',
      label: 'Publishing',
      value: profile.publishingEnabled,
    },
    { key: 'llmEnabled', label: 'LLM', value: profile.llmEnabled },
  ];

  return (
    <div data-testid="target-tab" className="py-3 space-y-4">
      <div className="flex items-center gap-2">
        <Badge tone={profile.canConsume ? 'green' : 'gray'}>
          {profile.canConsume ? 'consuming' : 'not consuming'}
        </Badge>
        <Badge tone={profile.canPublish ? 'green' : 'gray'}>
          {profile.canPublish ? 'can publish' : 'paused'}
        </Badge>
        {switches.map((s) => (
          <button
            key={s.key}
            data-testid={`profile-switch-${s.key}`}
            type="button"
            role="switch"
            aria-checked={s.value}
            onClick={() => flip(s.key, !s.value)}
            className={`text-xs px-2 py-1 rounded ${
              s.value
                ? 'bg-green-700 text-green-100'
                : 'bg-slate-700 text-slate-300'
            }`}
          >
            {s.label}: {s.value ? 'on' : 'off'}
          </button>
        ))}
      </div>
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-1.5">
          Telegram targets
        </h3>
        {profile.telegramTargets.length === 0 ? (
          <p className="text-xs text-slate-500">No telegram targets bound.</p>
        ) : (
          <ul className="space-y-1">
            {profile.telegramTargets.map((t) => (
              <li
                key={`${t.botId}:${t.chatId}`}
                className="text-sm text-slate-300 rounded bg-slate-900/60 px-2 py-1"
              >
                bot {t.botId} → {t.chatId}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-1.5">
          Threads targets
        </h3>
        {profile.threadsTargets.length === 0 ? (
          <p className="text-xs text-slate-500">No threads targets bound.</p>
        ) : (
          <ul className="space-y-1">
            {profile.threadsTargets.map((t) => (
              <li
                key={`${t.botId}:${t.chatId}`}
                className="text-sm text-slate-300 rounded bg-slate-900/60 px-2 py-1"
              >
                bot {t.botId} → {t.chatId}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FiltersTab({ profile }: { profile: ProfileView }): React.ReactElement {
  const { data: sources } = useProfileSources();
  const [channelId, setChannelId] = useState<string | null>(null);
  const activeChannel = channelId ?? sources?.[0]?.channelId ?? null;
  const filters = useChannelFilters(activeChannel);
  const toggle = useToggleChannelFilter(activeChannel ?? '');
  const preview = useFiltersPreview();
  const { data: messages } = useProfileRecentMessages(20);

  const sample = useMemo(
    () => (messages ?? []).find((m) => m.channelId === activeChannel) ?? null,
    [messages, activeChannel],
  );

  function runPreview() {
    if (activeChannel === null) return;
    preview.mutate({
      channelId: activeChannel,
      title: sample?.title ?? null,
      content: sample?.content ?? '',
    });
  }

  const previewData = preview.data ?? null;
  const rawEqualsFiltered =
    previewData !== null &&
    (previewData.rawTitle ?? null) === (previewData.filteredTitle ?? null) &&
    previewData.rawContent === previewData.filteredContent;

  return (
    <div data-testid="filters-tab" className="py-3 space-y-3">
      <select
        data-testid="filters-channel-select"
        aria-label="Filter channel"
        className="bg-slate-800 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700"
        value={activeChannel ?? ''}
        onChange={(e) => setChannelId(e.target.value)}
      >
        {(sources ?? []).map((s) => (
          <option key={s.channelId} value={s.channelId}>
            {s.title} · {s.channelId}
          </option>
        ))}
      </select>

      {filters.isLoading ? (
        <p className="text-slate-400">Loading filters…</p>
      ) : (
        <ul className="space-y-1.5">
          {(filters.data ?? []).map((f) => {
            const inProfileScope = profile.sourceToggles[f.channelId] ?? false;
            return (
              <li
                key={f.id}
                data-testid={`filter-row-${f.id}`}
                className="flex items-center gap-2 text-sm text-slate-300 rounded bg-slate-900/60 px-2 py-1.5"
              >
                <code className="flex-1 truncate text-xs">
                  {f.pattern} → {f.replacement}
                </code>
                {!inProfileScope ? (
                  <span className="text-[10px] text-slate-500">
                    outside profile scope
                  </span>
                ) : null}
                <button
                  data-testid={`filter-toggle-${f.id}`}
                  type="button"
                  role="switch"
                  aria-checked={f.isActive}
                  onClick={() => toggle.mutate(f.id)}
                  className={`text-xs px-2 py-1 rounded ${
                    f.isActive
                      ? 'bg-green-700 text-green-100'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {f.isActive ? 'On' : 'Off'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <button
          data-testid="filters-preview-button"
          type="button"
          onClick={runPreview}
          disabled={activeChannel === null || preview.isPending}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Preview with latest message
        </button>
        {previewData !== null ? (
          <div data-testid="filters-preview-result" className="mt-2">
            <Badge tone={rawEqualsFiltered ? 'gray' : 'blue'}>
              <span data-testid="raw-filtered-badge">
                {rawEqualsFiltered ? 'RAW (unchanged)' : 'filtered'}
              </span>
            </Badge>
            <p className="text-xs text-slate-500 mt-1">
              {previewData.filtersApplied}/{previewData.filtersTotal} filters
              applied
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LlmTab(): React.ReactElement {
  const { data, isLoading, error } = useProfileLlm();

  if (isLoading) return <p className="text-slate-400 py-2">Loading llm…</p>;
  if (error || !data) {
    return <p className="text-slate-500 py-2">LLM config unavailable.</p>;
  }
  const { config, flags } = data;
  const rows: ReadonlyArray<readonly [string, string]> = [
    ['Default template', config.defaultTemplateId],
    ['Target channel', config.targetChannel],
    ['LLM enabled', String(config.llmEnabled)],
    ['Publishing enabled', String(config.publishingEnabled)],
    ['Reject non-latin', String(config.rejectNonLatin)],
    ['Daily cap', String(config.dailyCap)],
    ['Max attempts', String(config.llmMaxAttempts)],
    ['Pipeline mode', flags.mode],
  ];
  return (
    <div data-testid="llm-tab" className="py-3">
      <section data-testid="llm-config-section">
        <h3 className="text-sm font-semibold text-slate-300 mb-1.5">
          LLM config
        </h3>
        <dl className="grid grid-cols-2 gap-1.5">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded bg-slate-900/60 px-2 py-1.5">
              <dt className="text-[10px] uppercase text-slate-500">{label}</dt>
              <dd className="text-sm text-slate-100">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export function ProfileTabPanels({
  tab,
  profile,
}: {
  tab: ProfileTab;
  profile: ProfileView;
}): React.ReactElement {
  switch (tab) {
    case 'sources':
      return <SourcesTab profile={profile} />;
    case 'keywords':
      return <KeywordsTab />;
    case 'queue':
      return <QueueTab profile={profile} />;
    case 'target':
      return <TargetTab profile={profile} />;
    case 'filters':
      return <FiltersTab profile={profile} />;
    case 'llm':
      return <LlmTab />;
  }
}
