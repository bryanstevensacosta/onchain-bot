import { useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/modal';
import {
  isValidProfileName,
  normalizeProfileName,
  useActivateProfile,
  useCreateProfile,
  useDeactivateProfile,
  useDeleteProfile,
  useProfileTemplates,
  type ProfileView,
} from '@/entities/profile';

interface ManageSessionModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly profiles: ReadonlyArray<ProfileView>;
  readonly onCreated: (id: string) => void;
}

export function ManageSessionModal({
  isOpen,
  onClose,
  profiles,
  onCreated,
}: ManageSessionModalProps): React.ReactElement {
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
      { onSuccess: (created) => onCreated(created.id) },
    );
  }

  function handleClose() {
    create.reset();
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Manage Sessions"
      size="lg"
    >
      <div className="max-h-[70vh] overflow-y-auto pr-1">
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
          onChange={(e) => setName(e.target.value)}
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

        <h3 className="text-sm font-semibold text-slate-200 mt-5 mb-2">
          Existing sessions
        </h3>
        <ul className="space-y-1.5">
          {profiles.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 text-sm text-slate-300"
            >
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-xs text-slate-500">
                {p.active ? 'active' : 'inactive'}
              </span>
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
                onClick={() => remove.mutate(p.id)}
                className="text-xs px-2 py-1 rounded bg-red-900/50 text-red-300 hover:bg-red-900"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
