import { useMemo, useState } from 'react';
import {
  isValidProfileName,
  normalizeProfileName,
  useActivateProfile,
  useCreateProfile,
  useDeactivateProfile,
  useDeleteProfile,
  useProfileTemplates,
  type ProfileView,
} from '@/entities/feed-session';

interface SessionManagementPanelProps {
  readonly profiles: ReadonlyArray<ProfileView>;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onCreated: (id: string) => void;
  readonly onDeleted: (id: string) => void;
}

/**
 * Session management rendered inline in the Overview tab (no modal).
 *
 * Create form (name + optional template + validation) on top, existing
 * sessions list (select + activate/deactivate + delete behind confirms)
 * below. Selection goes through the parent guard for unsaved changes.
 */
export function SessionManagementPanel({
  profiles,
  selectedId,
  onSelect,
  onCreated,
  onDeleted,
}: SessionManagementPanelProps): React.ReactElement {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string>('');
  const { data: templates } = useProfileTemplates();
  const create = useCreateProfile();
  const activate = useActivateProfile();
  const deactivate = useDeactivateProfile();
  const remove = useDeleteProfile();

  const existingIds = useMemo(
    () => new Set(profiles.map((p) => p.id)),
    [profiles],
  );
  const normalized = useMemo(() => normalizeProfileName(name), [name]);
  const duplicate = normalized !== '' && existingIds.has(normalized);
  const nameError =
    name !== '' && !isValidProfileName(name)
      ? 'Use lowercase letters, digits and single dashes (e.g. desk-alpha).'
      : null;
  const duplicateError = duplicate
    ? `Session id “${normalized}” already exists.`
    : null;
  const canCreate =
    normalized !== '' && isValidProfileName(normalized) && !duplicate;

  function handleCreate() {
    if (!canCreate) return;
    create.mutate(
      {
        id: normalized,
        name: name.trim(),
        templateId: templateId === '' ? null : templateId,
      },
      {
        onSuccess: (created) => {
          setName('');
          setTemplateId('');
          create.reset();
          onCreated(created.id);
        },
      },
    );
  }

  function handleDelete(id: string, sessionName: string) {
    if (
      !window.confirm(
        `Delete session “${sessionName}”? This removes it from the DB.`,
      )
    ) {
      return;
    }
    remove.mutate(id, { onSuccess: () => onDeleted(id) });
  }

  return (
    <div data-testid="session-management" className="space-y-3">
      <section aria-label="Create session">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">
          Create session
        </h3>
        <label
          className="block text-xs uppercase text-slate-500 mb-1"
          htmlFor="session-name"
        >
          Session name
        </label>
        <input
          id="session-name"
          data-testid="session-name-input"
          className="w-full bg-slate-800 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700"
          value={name}
          placeholder="desk-alpha"
          onChange={(e) => setName(e.target.value.toLowerCase())}
        />
        <p
          data-testid="session-id-preview"
          className="text-xs text-slate-500 mt-1"
        >
          id: {normalized === '' ? '—' : normalized}
        </p>
        {nameError !== null ? (
          <p
            data-testid="session-name-error"
            className="text-xs text-red-400 mt-1"
          >
            {nameError}
          </p>
        ) : null}
        {duplicateError !== null ? (
          <p
            data-testid="session-name-error"
            className="text-xs text-red-400 mt-1"
          >
            {duplicateError}
          </p>
        ) : null}

        <label
          className="block text-xs uppercase text-slate-500 mt-3 mb-1"
          htmlFor="session-template"
        >
          Start from template (optional)
        </label>
        <select
          id="session-template"
          data-testid="session-template-select"
          className="w-full bg-slate-800 text-slate-100 text-sm rounded px-2 py-1.5 border border-slate-700"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">Ad-hoc (no template)</option>
          {(templates ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {create.error ? (
          <p className="text-xs text-red-400 mt-2">Could not create session.</p>
        ) : null}
        <button
          data-testid="session-create-button"
          type="button"
          disabled={!canCreate || create.isPending}
          onClick={handleCreate}
          className="mt-3 text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Create session
        </button>
      </section>

      <section aria-label="Existing sessions">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">
          Existing sessions
        </h3>
        <ul className="space-y-1.5">
          {profiles.map((p) => (
            <li
              key={p.id}
              data-testid={`session-row-${p.id}`}
              className="flex items-center gap-2 text-sm text-slate-300"
            >
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-xs text-slate-500">
                {p.active ? 'active' : 'inactive'}
              </span>
              {p.id === selectedId ? (
                <span
                  data-testid={`session-current-${p.id}`}
                  className="text-xs text-blue-400"
                >
                  current
                </span>
              ) : (
                <button
                  data-testid={`session-select-${p.id}`}
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
                >
                  Open
                </button>
              )}
              {p.active ? (
                <button
                  data-testid={`session-deactivate-${p.id}`}
                  type="button"
                  onClick={() => deactivate.mutate(p.id)}
                  className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
                >
                  Deactivate
                </button>
              ) : (
                <button
                  data-testid={`session-activate-${p.id}`}
                  type="button"
                  onClick={() => activate.mutate(p.id)}
                  className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
                >
                  Activate
                </button>
              )}
              <button
                data-testid={`session-delete-${p.id}`}
                type="button"
                onClick={() => handleDelete(p.id, p.name)}
                className="text-xs px-2 py-1 rounded bg-red-900/50 text-red-300 hover:bg-red-900"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
