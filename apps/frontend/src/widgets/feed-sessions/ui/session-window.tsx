import { useEffect, useMemo, useState } from 'react';
import {
  isValidProfileName,
  snapshotSessionToTemplate,
  useActivateProfile,
  useCreateProfileTemplate,
  useDeactivateProfile,
  useDeleteProfile,
  useDeleteProfileTemplate,
  useProfileTemplates,
  useUpdateProfile,
  useUpdateProfileTemplate,
  type ProfileView,
} from '@/entities/feed-session';
import {
  draftFromProfile,
  isDraftDirty,
  SessionTabPanels,
  type SessionDraft,
  type SessionFlagKey,
  type SessionTab,
} from './session-tabs';

interface SessionWindowProps {
  readonly profile: ProfileView;
  readonly tab: SessionTab;
  readonly onTabChange: (tab: SessionTab) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onDeleted: (id: string) => void;
  readonly profiles: ReadonlyArray<ProfileView>;
  readonly selectedId: string | null;
  readonly onSelectSession: (id: string) => void;
  readonly onCreated: (id: string) => void;
}

function applyTemplateToDraft(
  draft: SessionDraft,
  templateId: string,
  templates: ReturnType<typeof useProfileTemplates>['data'],
): SessionDraft {
  const template = (templates ?? []).find((t) => t.id === templateId);
  if (!template) return draft;
  const toggles: Record<string, boolean> = {};
  for (const key of Object.keys(draft.sourceToggles)) toggles[key] = false;
  for (const id of template.sourceIds) toggles[id] = true;
  return {
    ...draft,
    matchingEnabled: template.matchingEnabled,
    publishingEnabled: template.publishingEnabled,
    llmEnabled: template.llmEnabled,
    sourceToggles: toggles,
  };
}

export function SessionWindow({
  profile,
  tab,
  onTabChange,
  onDirtyChange,
  onDeleted,
  profiles,
  selectedId,
  onSelectSession,
  onCreated,
}: SessionWindowProps): React.ReactElement {
  const [draft, setDraft] = useState<SessionDraft>(() =>
    draftFromProfile(profile),
  );
  const [templateId, setTemplateId] = useState<string>('');
  const [templateName, setTemplateName] = useState('');
  const { data: templates } = useProfileTemplates();
  const update = useUpdateProfile();
  const remove = useDeleteProfile();
  const activate = useActivateProfile();
  const deactivate = useDeactivateProfile();
  const createTemplate = useCreateProfileTemplate();
  const patchTemplate = useUpdateProfileTemplate();
  const deleteTemplate = useDeleteProfileTemplate();

  useEffect(() => {
    setDraft(draftFromProfile(profile));
    setTemplateId(profile.templateId ?? '');
  }, [profile]);

  const dirty = useMemo(() => isDraftDirty(draft, profile), [draft, profile]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  function flip(key: SessionFlagKey) {
    setDraft((d) => ({ ...d, [key]: !d[key] }));
  }

  function toggleSource(channelId: string, enabled: boolean) {
    setDraft((d) => ({
      ...d,
      sourceToggles: { ...d.sourceToggles, [channelId]: enabled },
    }));
  }

  const nameError =
    draft.name !== '' && !isValidProfileName(draft.name)
      ? 'Use lowercase letters, digits and single dashes.'
      : null;

  function handleSave() {
    if (!dirty || nameError !== null || update.isPending) return;
    update.mutate({
      id: profile.id,
      body: {
        name: draft.name === profile.name ? undefined : draft.name,
        matchingEnabled: draft.matchingEnabled,
        publishingEnabled: draft.publishingEnabled,
        llmEnabled: draft.llmEnabled,
        sourceToggles: draft.sourceToggles,
        keywordIds: [...profile.keywordIds],
      },
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Delete session “${profile.name}”? This removes it from the DB.`,
      )
    ) {
      return;
    }
    remove.mutate(profile.id, { onSuccess: () => onDeleted(profile.id) });
  }

  function handleLoadTemplate() {
    if (templateId === '') return;
    if (
      dirty &&
      !window.confirm('Load template? Unsaved session changes are lost.')
    ) {
      return;
    }
    setDraft((d) => applyTemplateToDraft(d, templateId, templates));
  }

  function handleSaveTemplate() {
    const snapshot = snapshotSessionToTemplate({
      templateId: profile.templateId,
      active: profile.active,
      matchingEnabled: draft.matchingEnabled,
      publishingEnabled: draft.publishingEnabled,
      llmEnabled: draft.llmEnabled,
      keywordIds: profile.keywordIds,
      sourceToggles: draft.sourceToggles,
      telegramTargets: profile.telegramTargets,
      threadsTargets: profile.threadsTargets,
    });
    if (templateId === '') {
      const name = templateName.trim().toLowerCase();
      if (name === '') return;
      createTemplate.mutate(
        { name, ...snapshot },
        { onSuccess: (t) => setTemplateId(t.id) },
      );
      return;
    }
    if (
      !window.confirm(
        'Overwrite template with this session config (name and targets excluded)?',
      )
    ) {
      return;
    }
    patchTemplate.mutate({ id: templateId, body: { ...snapshot } });
  }

  function handleDeleteTemplate(id: string, name: string) {
    if (!window.confirm(`Delete template “${name}”?`)) return;
    deleteTemplate.mutate(id, {
      onSuccess: () => {
        if (templateId === id) setTemplateId('');
      },
    });
  }

  return (
    <div data-testid="session-window" className="py-2">
      <div className="flex flex-wrap items-center gap-2 rounded bg-slate-900/60 px-2 py-2">
        <label
          className="text-[10px] uppercase text-slate-500"
          htmlFor="window-session-name"
        >
          Name
        </label>
        <input
          id="window-session-name"
          data-testid="window-session-name"
          className="bg-slate-800 text-slate-100 text-sm rounded px-2 py-1 border border-slate-700"
          value={draft.name}
          onChange={(e) =>
            setDraft((d) => ({ ...d, name: e.target.value.toLowerCase() }))
          }
        />
        {nameError !== null ? (
          <span
            data-testid="window-name-error"
            className="text-xs text-red-400"
          >
            {nameError}
          </span>
        ) : null}
        {dirty ? (
          <span data-testid="window-dirty" className="text-xs text-amber-400">
            Unsaved changes
          </span>
        ) : null}
        <button
          data-testid="window-save"
          type="button"
          disabled={!dirty || nameError !== null || update.isPending}
          onClick={handleSave}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Save
        </button>
        {profile.active ? (
          <button
            data-testid="window-deactivate"
            type="button"
            onClick={() => deactivate.mutate(profile.id)}
            className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
          >
            Deactivate
          </button>
        ) : (
          <button
            data-testid="window-activate"
            type="button"
            onClick={() => activate.mutate(profile.id)}
            className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
          >
            Activate
          </button>
        )}
        <button
          data-testid="window-delete"
          type="button"
          onClick={handleDelete}
          className="text-xs px-2 py-1 rounded bg-red-900/50 text-red-300 hover:bg-red-900"
        >
          Delete session
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-slate-900/60 px-2 py-2">
        <label
          className="text-[10px] uppercase text-slate-500"
          htmlFor="window-template-select"
        >
          Template
        </label>
        <select
          id="window-template-select"
          data-testid="window-template-select"
          className="bg-slate-800 text-slate-100 text-sm rounded px-2 py-1 border border-slate-700"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">Empty (no template)</option>
          {(templates ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          data-testid="window-template-name"
          aria-label="New template name"
          placeholder="new-template-name"
          className="bg-slate-800 text-slate-100 text-sm rounded px-2 py-1 border border-slate-700"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value.toLowerCase())}
        />
        <button
          data-testid="window-template-save"
          type="button"
          onClick={handleSaveTemplate}
          className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
        >
          {templateId === '' ? 'Save as template' : 'Overwrite template'}
        </button>
        <button
          data-testid="window-template-load"
          type="button"
          disabled={templateId === ''}
          onClick={handleLoadTemplate}
          className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
        >
          Load
        </button>
        {templateId !== '' ? (
          <button
            data-testid={`window-template-delete-${templateId}`}
            type="button"
            aria-label="Delete template"
            onClick={() => {
              const name =
                (templates ?? []).find((t) => t.id === templateId)?.name ??
                templateId;
              handleDeleteTemplate(templateId, name);
            }}
            className="text-xs px-2 py-1 rounded bg-red-900/50 text-red-300 hover:bg-red-900"
          >
            ×
          </button>
        ) : null}
      </div>

      <SessionTabPanels
        tab={tab}
        profile={profile}
        draft={draft}
        onFlip={flip}
        onToggleSource={toggleSource}
        onGotoTab={onTabChange}
        profiles={profiles}
        selectedId={selectedId}
        onSelectSession={onSelectSession}
        onCreated={onCreated}
        onDeletedSession={onDeleted}
      />
    </div>
  );
}
