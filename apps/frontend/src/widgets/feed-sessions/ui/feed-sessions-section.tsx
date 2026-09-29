import { useCallback, useMemo, useRef, useState } from 'react';
import { useProfiles, useProfileTemplates } from '@/entities/feed-session';
import { ManageSessionModal } from './manage-session-modal';
import { SESSION_TABS, type SessionTab } from './session-tabs';
import { SessionWindow } from './session-window';
import { RecentWithBadges } from './recent-with-badges';

const CREATE_VALUE = '__create__';

/**
 * Publishing sessions section (merged `/profiles` → `/feed`).
 *
 * Header: `Session [name dropdown]` — the list shows a green/red status
 * dot per session plus a create-new entry. Selecting (or creating) a
 * session opens ONE window (Overview|Sources|Keywords|Filters|LLM|Target)
 * with staged edits, Save/Delete/Activate-Deactivate and template
 * save/load/delete. Switching sessions with unsaved changes asks first.
 */
export function FeedSessionsSection(): React.ReactElement {
  const { data: profiles, isLoading, error } = useProfiles();
  const { data: templates } = useProfileTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<SessionTab>('overview');
  const [manageOpen, setManageOpen] = useState(false);
  const dirtyRef = useRef(false);

  const active = useMemo(() => {
    if (!profiles || profiles.length === 0) return null;
    return profiles.find((p) => p.id === selectedId) ?? profiles[0];
  }, [profiles, selectedId]);

  const templateName = useMemo(() => {
    if (!active || !active.templateId) return 'Ad-hoc';
    return (
      (templates ?? []).find((t) => t.id === active.templateId)?.name ??
      active.templateId
    );
  }, [active, templates]);

  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  function confirmDiscard(): boolean {
    if (!dirtyRef.current) return true;
    return window.confirm(
      'Discard unsaved session changes and switch sessions?',
    );
  }

  function handlePickerChange(value: string) {
    if (value === CREATE_VALUE) {
      if (!confirmDiscard()) return;
      setManageOpen(true);
      return;
    }
    if (value === active?.id) return;
    if (!confirmDiscard()) return;
    setSelectedId(value);
    setTab('overview');
  }

  function handleDeleted(id: string) {
    dirtyRef.current = false;
    setSelectedId((current) => (current === id ? null : current));
    setTab('overview');
  }

  return (
    <section aria-label="Publishing sessions" className="space-y-0">
      <header
        data-testid="sessions-header"
        className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800 py-3 flex items-center gap-4"
      >
        <h2 className="text-lg font-bold text-slate-100">Session</h2>
        <select
          data-testid="session-picker"
          aria-label="Select session"
          className="bg-slate-800 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700"
          value={active?.id ?? ''}
          onChange={(e) => handlePickerChange(e.target.value)}
        >
          {(profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.active ? '●' : '○'} {p.name}
            </option>
          ))}
          <option value={CREATE_VALUE}>＋ Create new session</option>
        </select>
        <span
          data-testid="session-template-name"
          className="text-xs text-slate-400"
        >
          template: {templateName}
        </span>
        <button
          data-testid="manage-session-button"
          type="button"
          onClick={() => setManageOpen(true)}
          className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500"
        >
          Manage Sessions
        </button>
        {active !== null && (
          <span className="text-xs text-slate-500">
            {active.active ? 'active' : 'inactive'}
            {' · '}
            {active.canPublish ? 'can publish' : 'paused'}
          </span>
        )}
      </header>

      <nav
        data-testid="sessions-menu"
        aria-label="Session sections"
        className="sticky top-[57px] z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 py-2 flex gap-1"
      >
        {SESSION_TABS.map((t) => (
          <button
            key={t}
            data-testid={`session-tab-${t}`}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-sm capitalize transition-colors ${
              tab === t
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <p className="text-slate-400 py-4">Loading sessions…</p>
      ) : null}
      {error ? (
        <div data-testid="sessions-empty" className="text-slate-400 py-4">
          Sessions unavailable — is feed-publisher running?
        </div>
      ) : null}
      {!isLoading && !error && active === null ? (
        <div data-testid="sessions-empty" className="text-slate-400 py-4">
          No sessions yet — create one with Manage Sessions.
        </div>
      ) : null}

      {active !== null ? (
        <>
          <RecentWithBadges />
          <SessionWindow
            key={active.id}
            profile={active}
            tab={tab}
            onTabChange={setTab}
            onDirtyChange={onDirtyChange}
            onDeleted={handleDeleted}
          />
        </>
      ) : null}

      <ManageSessionModal
        isOpen={manageOpen}
        onClose={() => setManageOpen(false)}
        profiles={profiles ?? []}
        onCreated={(id) => {
          setSelectedId(id);
          setTab('overview');
          setManageOpen(false);
        }}
      />
    </section>
  );
}
