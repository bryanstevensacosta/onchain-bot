import { useMemo, useState } from 'react';
import { useProfiles } from '@/entities/profile';
import { ManageProfileModal } from './ui/manage-profile-modal';
import { ProfileTabPanels } from './ui/profile-tabs';
import { RecentWithBadges } from './ui/recent-with-badges';

const TABS = [
  'sources',
  'keywords',
  'queue',
  'target',
  'filters',
  'llm',
] as const;

export type ProfileTab = (typeof TABS)[number];

export function ProfilesPage(): React.ReactElement {
  const { data: profiles, isLoading, error } = useProfiles();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>('sources');
  const [manageOpen, setManageOpen] = useState(false);

  const active = useMemo(() => {
    if (!profiles || profiles.length === 0) return null;
    return profiles.find((p) => p.id === selectedId) ?? profiles[0];
  }, [profiles, selectedId]);

  return (
    <div className="px-6 py-4">
      <header
        data-testid="profiles-header"
        className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur border-b border-slate-800 py-3 flex items-center gap-4"
      >
        <h1 className="text-lg font-bold text-slate-100">
          {active ? `[Profile: ${active.name}]` : '[Profile: —]'}
        </h1>
        <select
          data-testid="profile-picker"
          aria-label="Select profile"
          className="bg-slate-800 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700"
          value={active?.id ?? ''}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {(profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          data-testid="manage-profile-button"
          type="button"
          onClick={() => setManageOpen(true)}
          className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500"
        >
          Manage Profile
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
        data-testid="profiles-menu"
        aria-label="Profile sections"
        className="sticky top-[57px] z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 py-2 flex gap-1"
      >
        {TABS.map((t) => (
          <button
            key={t}
            data-testid={`profile-tab-${t}`}
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
        <p className="text-slate-400 py-4">Loading profiles…</p>
      ) : null}
      {error ? (
        <div data-testid="profiles-empty" className="text-slate-400 py-4">
          Profiles unavailable — is feed-publisher running?
        </div>
      ) : null}
      {!isLoading && !error && active === null ? (
        <div data-testid="profiles-empty" className="text-slate-400 py-4">
          No profiles yet — create one with Manage Profile.
        </div>
      ) : null}

      {active !== null ? (
        <>
          <RecentWithBadges />
          <ProfileTabPanels tab={tab} profile={active} />
        </>
      ) : null}

      <ManageProfileModal
        isOpen={manageOpen}
        onClose={() => setManageOpen(false)}
        profiles={profiles ?? []}
        onCreated={(id) => {
          setSelectedId(id);
          setManageOpen(false);
        }}
      />
    </div>
  );
}
