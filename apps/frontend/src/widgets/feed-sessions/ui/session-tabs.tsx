import { useMemo, useState } from 'react';
import { Badge } from '@/shared/ui/badge';
import { FeedQueueStatsStrip } from '@/features/feed-publisher/ui/feed-queue-stats-strip';
import { KeywordsSection } from '@/features/feed-publisher/ui/keywords-section';
import { BlacklistManager } from '@/features/feed-publisher/ui/blacklist-manager';
import { ManageFeedSourcesModal } from '@/features/manage-feed-sources';
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
  type ProfileView,
  type PublisherBlacklistView,
  type PublisherKeywordView,
} from '@/entities/feed-session';
export const SESSION_TABS = [
  'overview',
  'sources',
  'keywords',
  'filters',
  'llm',
  'target',
] as const;

export type SessionTab = (typeof SESSION_TABS)[number];

export type SessionFlagKey =
  | 'matchingEnabled'
  | 'publishingEnabled'
  | 'llmEnabled';

export interface SessionDraft {
  readonly name: string;
  readonly matchingEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly llmEnabled: boolean;
  readonly sourceToggles: Record<string, boolean>;
}

export function draftFromProfile(profile: ProfileView): SessionDraft {
  return {
    name: profile.name,
    matchingEnabled: profile.matchingEnabled,
    publishingEnabled: profile.publishingEnabled,
    llmEnabled: profile.llmEnabled,
    sourceToggles: { ...profile.sourceToggles },
  };
}

export function isDraftDirty(
  draft: SessionDraft,
  profile: ProfileView,
): boolean {
  return (
    draft.name !== profile.name ||
    draft.matchingEnabled !== profile.matchingEnabled ||
    draft.publishingEnabled !== profile.publishingEnabled ||
    draft.llmEnabled !== profile.llmEnabled ||
    JSON.stringify(draft.sourceToggles) !==
      JSON.stringify(profile.sourceToggles)
  );
}

const PAGE_SIZE = 5;

const FLAG_LABELS: ReadonlyArray<{ key: SessionFlagKey; label: string }> = [
  { key: 'matchingEnabled', label: 'Matching' },
  { key: 'publishingEnabled', label: 'Target publish' },
  { key: 'llmEnabled', label: 'LLM' },
];

export function FlagSwitches({
  draft,
  onFlip,
  testPrefix = 'session-switch',
}: {
  draft: SessionDraft;
  onFlip: (key: SessionFlagKey) => void;
  testPrefix?: string;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FLAG_LABELS.map((s) => (
        <button
          key={s.key}
          data-testid={`${testPrefix}-${s.key}`}
          type="button"
          role="switch"
          aria-checked={draft[s.key]}
          onClick={() => onFlip(s.key)}
          className={`text-xs px-2 py-1 rounded ${
            draft[s.key]
              ? 'bg-green-700 text-green-100'
              : 'bg-slate-700 text-slate-300'
          }`}
        >
          {s.label}: {draft[s.key] ? 'on' : 'off'}
        </button>
      ))}
    </div>
  );
}

function SourcesTab({
  profile,
  draft,
  onToggleSource,
}: {
  profile: ProfileView;
  draft: SessionDraft;
  onToggleSource: (channelId: string, enabled: boolean) => void;
}): React.ReactElement {
  const { data: sources, isLoading, error } = useProfileSources();
  const [manageOpen, setManageOpen] = useState(false);

  if (isLoading) return <p className="text-slate-400 py-2">Loading sources…</p>;
  if (error || !sources) {
    return <p className="text-slate-500 py-2">Sources unavailable.</p>;
  }
  return (
    <div data-testid="sources-tab" className="py-3">
      <p className="text-xs text-slate-500 mb-2">
        Global sources with per-session toggles (toggles are staged — press Save
        to apply).
      </p>
      <button
        data-testid="sources-manage-button"
        type="button"
        onClick={() => setManageOpen(true)}
        className="mb-2 text-xs px-2 py-1 rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
      >
        Manage global sources
      </button>
      <ul className="space-y-1.5">
        {(sources ?? []).map((s) => {
          const on = draft.sourceToggles[s.channelId] ?? false;
          return (
            <li
              key={s.channelId}
              className="flex items-center gap-2 text-sm text-slate-300 rounded bg-slate-900/60 px-2 py-1.5"
            >
              <span className="flex-1 truncate">
                {s.title}
                <span className="text-slate-500"> · {s.channelId}</span>
              </span>
              {!profile.sourceToggles[s.channelId] && on ? (
                <span
                  data-testid={`source-staged-${s.channelId}`}
                  className="text-[10px] text-amber-400"
                >
                  staged
                </span>
              ) : null}
              <button
                data-testid={`source-toggle-${s.channelId}`}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => onToggleSource(s.channelId, !on)}
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
      <ManageFeedSourcesModal
        isOpen={manageOpen}
        onClose={() => setManageOpen(false)}
      />
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

function KeywordsTab({
  profile,
  draft,
  onFlip,
}: {
  profile: ProfileView;
  draft: SessionDraft;
  onFlip: (key: SessionFlagKey) => void;
}): React.ReactElement {
  const keywords = usePublisherKeywords();
  const blacklist = usePublisherBlacklist();

  const boundIds = useMemo(() => new Set(profile.keywordIds), [profile]);
  const enabledSourceIds = useMemo(
    () =>
      Object.entries(draft.sourceToggles)
        .filter(([, on]) => on)
        .map(([channelId]) => channelId),
    [draft],
  );
  const enabledSources = useMemo(
    () => new Set(enabledSourceIds),
    [enabledSourceIds],
  );

  const allowed: ReadonlyArray<PublisherKeywordView> = useMemo(
    () =>
      (keywords.data ?? []).filter(
        (k) => k.andGroupId === null && boundIds.has(k.id),
      ),
    [keywords.data, boundIds],
  );
  const blocked: ReadonlyArray<PublisherBlacklistView> = useMemo(
    () =>
      (blacklist.data ?? []).filter(
        (b) =>
          b.sourceChannelIds.length === 0 ||
          b.sourceChannelIds.some((id) => enabledSources.has(id)),
      ),
    [blacklist.data, enabledSources],
  );
  const compound = useMemo(
    () =>
      splitKeywordGroups(
        (keywords.data ?? []).filter((k) => boundIds.has(k.id)),
      ),
    [keywords.data, boundIds],
  );

  if (keywords.isLoading || blacklist.isLoading) {
    return <p className="text-slate-400 py-2">Loading keywords…</p>;
  }
  if (keywords.error || blacklist.error) {
    return <p className="text-slate-500 py-2">Keywords unavailable.</p>;
  }
  return (
    <div data-testid="keywords-tab" className="py-3 space-y-4">
      <FlagSwitches draft={draft} onFlip={onFlip} />
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
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-1.5">
          Manage keywords
        </h3>
        <div className="space-y-4">
          <KeywordsSection
            filterIds={[...profile.keywordIds]}
            sessionName={profile.name}
          />
          <BlacklistManager
            filterSourceIds={enabledSourceIds}
            sessionName={profile.name}
          />
        </div>
      </section>
    </div>
  );
}

function QueueSummary({
  profile,
}: {
  profile: ProfileView;
}): React.ReactElement {
  const { data: entries, isLoading, error } = useProfileQueue(50);
  const matching = profile.keywordIds.length;

  if (isLoading) return <p className="text-slate-400 py-2">Loading queue…</p>;
  return (
    <div data-testid="queue-tab" className="space-y-3">
      <FeedQueueStatsStrip />
      {error || !entries ? (
        <p className="text-slate-500 py-2">Queue unavailable.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {matching} session keyword(s) bound · {entries.length} entries
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

function OverviewTab({
  profile,
  draft,
  onFlip,
  onGotoTab,
}: {
  profile: ProfileView;
  draft: SessionDraft;
  onFlip: (key: SessionFlagKey) => void;
  onGotoTab: (tab: SessionTab) => void;
}): React.ReactElement {
  return (
    <div data-testid="overview-tab" className="py-3 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={profile.active ? 'green' : 'gray'}>
          {profile.active ? 'active' : 'inactive'}
        </Badge>
        <Badge tone={profile.canConsume ? 'green' : 'gray'}>
          {profile.canConsume ? 'consuming' : 'not consuming'}
        </Badge>
        <Badge tone={profile.canPublish ? 'green' : 'gray'}>
          {profile.canPublish ? 'can publish' : 'paused'}
        </Badge>
      </div>
      <FlagSwitches draft={draft} onFlip={onFlip} />
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-1.5">
          Targets (click a row to open the Target tab)
        </h3>
        {profile.telegramTargets.length === 0 &&
        profile.threadsTargets.length === 0 ? (
          <p className="text-xs text-slate-500">
            No targets bound — dashboard-only mode.
          </p>
        ) : (
          <ul className="space-y-1">
            {profile.telegramTargets.map((t) => (
              <li key={`telegram:${t.botId}:${t.chatId}`}>
                <button
                  data-testid={`overview-target-telegram-${t.chatId}`}
                  type="button"
                  onClick={() => onGotoTab('target')}
                  className="w-full text-left text-sm text-slate-300 rounded bg-slate-900/60 px-2 py-1 hover:bg-slate-800"
                >
                  bot {t.botId} → {t.chatId}
                </button>
              </li>
            ))}
            {profile.threadsTargets.map((t) => (
              <li key={`threads:${t.botId}:${t.chatId}`}>
                <button
                  data-testid={`overview-target-threads-${t.chatId}`}
                  type="button"
                  onClick={() => onGotoTab('target')}
                  className="w-full text-left text-sm text-slate-300 rounded bg-slate-900/60 px-2 py-1 hover:bg-slate-800"
                >
                  thread {t.botId} → {t.chatId}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold text-slate-300 mb-1.5">Queue</h3>
        <QueueSummary profile={profile} />
      </section>
    </div>
  );
}

function TargetTab({
  profile,
  draft,
  onFlip,
}: {
  profile: ProfileView;
  draft: SessionDraft;
  onFlip: (key: SessionFlagKey) => void;
}): React.ReactElement {
  return (
    <div data-testid="target-tab" className="py-3 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={profile.canConsume ? 'green' : 'gray'}>
          {profile.canConsume ? 'consuming' : 'not consuming'}
        </Badge>
        <Badge tone={profile.canPublish ? 'green' : 'gray'}>
          {profile.canPublish ? 'can publish' : 'paused'}
        </Badge>
        <FlagSwitches draft={draft} onFlip={onFlip} />
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
                data-testid={`target-row-telegram-${t.chatId}`}
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
                data-testid={`target-row-threads-${t.chatId}`}
                className="text-sm text-slate-300 rounded bg-slate-900/60 px-2 py-1"
              >
                thread {t.botId} → {t.chatId}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FiltersTab({
  draft,
  onFlip,
  profile,
}: {
  draft: SessionDraft;
  onFlip: (key: SessionFlagKey) => void;
  profile: ProfileView;
}): React.ReactElement {
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
      <FlagSwitches draft={draft} onFlip={onFlip} />
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
            const inProfileScope =
              draft.sourceToggles[f.channelId] ??
              profile.sourceToggles[f.channelId] ??
              false;
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
                    outside session scope
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

function LlmTab({
  draft,
  onFlip,
}: {
  draft: SessionDraft;
  onFlip: (key: SessionFlagKey) => void;
}): React.ReactElement {
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
    <div data-testid="llm-tab" className="py-3 space-y-3">
      <FlagSwitches draft={draft} onFlip={onFlip} />
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

export interface SessionTabPanelsProps {
  readonly tab: SessionTab;
  readonly profile: ProfileView;
  readonly draft: SessionDraft;
  readonly onFlip: (key: SessionFlagKey) => void;
  readonly onToggleSource: (channelId: string, enabled: boolean) => void;
  readonly onGotoTab: (tab: SessionTab) => void;
}

export function SessionTabPanels({
  tab,
  profile,
  draft,
  onFlip,
  onToggleSource,
  onGotoTab,
}: SessionTabPanelsProps): React.ReactElement {
  switch (tab) {
    case 'overview':
      return (
        <OverviewTab
          profile={profile}
          draft={draft}
          onFlip={onFlip}
          onGotoTab={onGotoTab}
        />
      );
    case 'sources':
      return (
        <SourcesTab
          profile={profile}
          draft={draft}
          onToggleSource={onToggleSource}
        />
      );
    case 'keywords':
      return <KeywordsTab profile={profile} draft={draft} onFlip={onFlip} />;
    case 'filters':
      return <FiltersTab draft={draft} onFlip={onFlip} profile={profile} />;
    case 'llm':
      return <LlmTab draft={draft} onFlip={onFlip} />;
    case 'target':
      return <TargetTab profile={profile} draft={draft} onFlip={onFlip} />;
  }
}
