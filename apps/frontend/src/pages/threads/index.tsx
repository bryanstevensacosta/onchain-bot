import { useState } from 'react';
import { Button, Card } from '@/shared/ui';
import { ENDPOINTS } from '@/shared/api/endpoints';
import { threadsPublisherKeys } from '@/entities/threads';
import {
  ThreadsContentFilterManager,
  useSearchThreadsPhrases,
  useThreadsKeywords,
  useThreadsLlmConfig,
  useThreadsMatchingConfig,
  useThreadsMatchingHealth,
  useThreadsQueue,
  useThreadsQueueCounts,
  useThreadsTemplates,
  useToggleThreadsMatching,
  useUpdateThreadsLlmConfig,
  useCancelThreadsQueueEntry,
  type ThreadsLlmConfigView,
} from '@/features/threads-publisher';

// Publisher prefix derived from the ENDPOINTS.threads single source of
// truth — never a hardcoded '/threads-publisher' duplicate.
const THREADS_PUBLISHER_BASE = ENDPOINTS.threads.keywords.list.replace(
  /\/keywords$/,
  '',
);

// Page-local toggle composers over the T7 LLM-config hooks (matching has
// its own T7 toggle; LLM + publishing compose update + cached read).
function useToggleThreadsLlm(): {
  toggle: () => void;
  isPending: boolean;
} {
  const cfg = useThreadsLlmConfig();
  const updater = useUpdateThreadsLlmConfig();
  return {
    toggle: () => updater.update({ llmEnabled: !cfg.data?.llmEnabled }),
    isPending: updater.isPending,
  };
}

function useToggleThreadsPublishing(): {
  toggle: () => void;
  isPending: boolean;
} {
  const cfg = useThreadsLlmConfig();
  const updater = useUpdateThreadsLlmConfig();
  return {
    toggle: () =>
      updater.update({ publishingEnabled: !cfg.data?.publishingEnabled }),
    isPending: updater.isPending,
  };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function ThreadsKeywordsSection(): React.ReactElement {
  const { data, isLoading, error } = useThreadsKeywords();
  const keywords = data ?? [];
  const [phraseSearch, setPhraseSearch] = useState('');
  const searchResults = useSearchThreadsPhrases(phraseSearch);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-400">Search phrases:</label>
        <input
          type="search"
          value={phraseSearch}
          onChange={(e) => setPhraseSearch(e.target.value)}
          placeholder="Search Threads keywords & blacklist…"
          aria-label="Search Threads phrases by text"
          className="bg-slate-800 text-slate-100 text-sm rounded px-3 py-1.5 border border-slate-700 placeholder:text-slate-500 flex-1 min-w-[200px]"
        />
        {phraseSearch.trim().length > 0 && (
          <div className="text-xs text-slate-400">
            {searchResults.isLoading ? (
              <span>Searching...</span>
            ) : searchResults.data ? (
              <span>
                Found {searchResults.data.length} phrase
                {searchResults.data.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span>No results</span>
            )}
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="text-slate-500">Cargando...</div>
      ) : error ? (
        <div className="text-red-400 text-sm">Error: {String(error)}</div>
      ) : keywords.length === 0 ? (
        <div className="text-slate-500 text-sm">No Threads keywords yet.</div>
      ) : (
        <ul className="space-y-2">
          {keywords.map((kw) => (
            <li
              key={kw.id}
              className="flex items-center justify-between rounded bg-slate-800/50 px-3 py-2 text-sm"
            >
              <span className="font-mono text-slate-200">{kw.phrase}</span>
              <span
                className={`text-xs ${kw.enabled ? 'text-green-400' : 'text-slate-500'}`}
              >
                {kw.enabled ? 'enabled' : 'disabled'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThreadsMatchingToggles(): React.ReactElement {
  const matchingCfg = useThreadsMatchingConfig();
  const matchingMut = useToggleThreadsMatching();
  const llmCfg = useThreadsLlmConfig();
  const llmMut = useToggleThreadsLlm();
  const publishingMut = useToggleThreadsPublishing();

  const isMatchingEnabled = matchingCfg.data?.enabled ?? false;
  const isLlmEnabled = llmCfg.data?.llmEnabled ?? false;
  const isPublishingEnabled = llmCfg.data?.publishingEnabled ?? false;
  const isWorking =
    matchingCfg.isLoading ||
    llmCfg.isLoading ||
    matchingMut.isPending ||
    llmMut.isPending ||
    publishingMut.isPending;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button
          variant={isMatchingEnabled ? 'danger' : 'primary'}
          size="sm"
          onClick={() => matchingMut.toggle()}
          disabled={isWorking}
          className="min-w-[180px]"
        >
          {matchingMut.isPending ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {isMatchingEnabled ? 'Stopping...' : 'Starting...'}
            </span>
          ) : isMatchingEnabled ? (
            '⏸ Stop Threads Matching'
          ) : (
            '▶ Start Threads Matching'
          )}
        </Button>
        <div className="text-xs text-slate-400">
          {isMatchingEnabled ? (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Enqueuing Threads matches
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-slate-500 rounded-full" />
              Threads matching paused
            </span>
          )}
        </div>
      </div>

      {import.meta.env.VITE_APP_ENV !== 'production' && (
        <div className="flex items-center gap-3">
          <Button
            variant={isLlmEnabled ? 'danger' : 'primary'}
            size="sm"
            onClick={() => llmMut.toggle()}
            disabled={isWorking}
            className="min-w-[180px]"
          >
            {llmMut.isPending ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {isLlmEnabled ? 'Disabling...' : 'Enabling...'}
              </span>
            ) : isLlmEnabled ? (
              '⏸ Disable Threads LLM'
            ) : (
              '▶ Enable Threads LLM'
            )}
          </Button>
          <div className="text-xs text-slate-400">
            {isLlmEnabled ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                Threads LLM refines content
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-slate-500 rounded-full" />
                Publishing raw Threads content
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant={isPublishingEnabled ? 'danger' : 'primary'}
          size="sm"
          onClick={() => publishingMut.toggle()}
          disabled={isWorking}
          className="min-w-[180px]"
        >
          {publishingMut.isPending ? (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {isPublishingEnabled ? 'Stopping...' : 'Starting...'}
            </span>
          ) : isPublishingEnabled ? (
            '⏸ Stop Threads Publishing'
          ) : (
            '▶ Start Threads Publishing'
          )}
        </Button>
        <div className="text-xs text-slate-400">
          {isPublishingEnabled ? (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Threads queue draining active
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-slate-500 rounded-full" />
              Threads publishing paused
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadsMatchingHealthBadge(): React.ReactElement {
  const { data, isLoading, error } = useThreadsMatchingHealth();
  if (isLoading)
    return (
      <div className="text-xs text-slate-500">Checking Threads health…</div>
    );
  if (error || !data)
    return (
      <div className="text-xs text-red-400">Threads health unavailable</div>
    );
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span
        className={`inline-block w-2 h-2 rounded-full ${data.enabled ? 'bg-green-500' : 'bg-slate-500'}`}
      />
      <span>Threads matching {data.enabled ? 'active' : 'paused'}</span>
      <span>·</span>
      <span>pending {data.queuePending}</span>
      {data.consecutiveFetchFailures > 0 && (
        <span className="text-amber-400">
          · {data.consecutiveFetchFailures} fetch failures
        </span>
      )}
    </div>
  );
}

function ThreadsQueueSection(): React.ReactElement {
  const { data: counts } = useThreadsQueueCounts();
  const pending = counts?.pending ?? 0;
  const publishedToday = counts?.publishedToday ?? 0;
  const remaining = counts?.remaining ?? 0;
  const { data, isLoading, error } = useThreadsQueue(50);
  const entries = data ?? [];
  const cancelMutation = useCancelThreadsQueueEntry();
  return (
    <div className="space-y-3">
      <ThreadsMatchingToggles />
      <ThreadsMatchingHealthBadge />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-xs uppercase text-slate-500">Pending</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">
            {pending}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">
            Published today
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-1">
            {publishedToday}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Remaining</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">
            {remaining}
          </div>
        </Card>
      </div>
      {isLoading ? (
        <div className="text-slate-500">Cargando...</div>
      ) : error ? (
        <div className="text-red-400 text-sm">Error: {String(error)}</div>
      ) : entries.length === 0 ? (
        <div className="text-slate-500 text-sm">Threads queue is empty.</div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded bg-slate-800/50 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-200">
                  {entry.rawTitle ?? entry.rawContent?.slice(0, 80) ?? '—'}
                </span>
                <span className="text-xs text-slate-400">{entry.status}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span>{entry.displayName}</span>
                <span>·</span>
                <span>msg {entry.messageId}</span>
                {entry.status === 'PENDING' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(entry.id)}
                    aria-label={`Cancel Threads entry ${entry.id}`}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThreadsBlockedSection(): React.ReactElement {
  const { data, isLoading, error } = useThreadsQueue(50, 'BLOCKED');
  const entries = data ?? [];
  if (isLoading) return <div className="text-slate-500">Cargando...</div>;
  if (error)
    return <div className="text-red-400 text-sm">Error: {String(error)}</div>;
  if (entries.length === 0)
    return (
      <div className="text-slate-500 text-sm">No blocked Threads posts.</div>
    );
  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded bg-red-950/30 border border-red-900/50 px-3 py-2 text-sm"
        >
          <div className="text-slate-200">
            {entry.rawTitle ?? entry.rawContent?.slice(0, 80) ?? '—'}
          </div>
          {entry.blockedReason && (
            <div className="mt-1 text-xs text-red-300">
              {entry.blockedReason}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ThreadsLlmConfigSection(): React.ReactElement {
  const { data, isLoading } = useThreadsLlmConfig();
  const updater = useUpdateThreadsLlmConfig();
  if (isLoading || !data)
    return <div className="text-slate-500">Cargando...</div>;
  const cfg: ThreadsLlmConfigView = data;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div className="text-slate-400">Daily cap</div>
        <div className="text-slate-100">{cfg.dailyCap}</div>
        <div className="text-slate-400">LLM attempts</div>
        <div className="text-slate-100">{cfg.llmMaxAttempts}</div>
        <div className="text-slate-400">Reject non-latin</div>
        <div className="text-slate-100">
          {cfg.rejectNonLatin ? 'yes' : 'no'}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={updater.isPending}
          onClick={() =>
            updater.update({ rejectNonLatin: !cfg.rejectNonLatin })
          }
        >
          Toggle latin filter
        </Button>
      </div>
    </div>
  );
}

function ThreadsPromptTemplatesSection(): React.ReactElement {
  const { data, isLoading } = useThreadsTemplates();
  const templates = data ?? [];
  if (isLoading) return <div className="text-slate-500">Cargando...</div>;
  if (templates.length === 0)
    return (
      <div className="text-slate-500 text-sm">No Threads templates yet.</div>
    );
  return (
    <ul className="space-y-2">
      {templates.map((tpl) => (
        <li key={tpl.id} className="rounded bg-slate-800/50 px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">{tpl.name}</span>
            <span className="text-xs text-slate-400">{tpl.model}</span>
          </div>
          {tpl.description && (
            <div className="mt-1 text-xs text-slate-400">{tpl.description}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ThreadsPage(): React.ReactElement {
  const [channelFilter, setChannelFilter] = useState<string>('');

  return (
    <div className="px-6 py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">Threads</h1>
          <p className="text-sm text-slate-400 mt-1">
            Threads publishing pipeline: keywords, filters, queue, and
            drafting assistant.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-400">Filter by channel:</label>
        <input
          type="search"
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          placeholder="Channel id…"
          aria-label="Filter Threads filters by channel"
          className="bg-slate-800 text-slate-100 text-sm rounded px-3 py-1.5 border border-slate-700 placeholder:text-slate-500"
        />
      </div>

      <aside className="space-y-4">
        <details
          open
          className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 select-none">
            Keywords
          </summary>
          <div className="pt-2">
            <ThreadsKeywordsSection />
          </div>
        </details>

        <details
          open
          className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 select-none">
            Content Filters
          </summary>
          <div className="pt-2">
            {channelFilter ? (
              <ThreadsContentFilterManager
                channelId={channelFilter}
                basePath={THREADS_PUBLISHER_BASE}
                queryKeys={threadsPublisherKeys.all}
              />
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">
                Enter a channel above to manage its Threads filters
              </p>
            )}
          </div>
        </details>

        <details
          open
          className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 select-none">
            Queue
          </summary>
          <div className="space-y-3 pt-2">
            <ThreadsQueueSection />
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
            <ThreadsBlockedSection />
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
            <ThreadsLlmConfigSection />
          </div>
        </details>

        <details
          open
          className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/30 p-4"
        >
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200 select-none">
            Prompt Templates
          </summary>
          <div className="space-y-4 pt-2">
            <ThreadsPromptTemplatesSection />
          </div>
        </details>
      </aside>
    </div>
  );
}
