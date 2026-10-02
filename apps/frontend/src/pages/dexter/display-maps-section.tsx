import { useState } from 'react';
import {
  useCreateDisplayMap,
  useDeleteDisplayMap,
  useDisplayMaps,
  useUpdateDisplayMap,
  type DisplayMapView,
} from '@/entities/dexter';
import { Button, Card, Modal } from '@/shared/ui';
import { englishMutationError } from './dexter-template-helpers';

type ModalMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; row: DisplayMapView };

function DisplayMapFormModal({
  mode,
  onClose,
}: {
  mode: Exclude<ModalMode, { kind: 'closed' }>;
  onClose: () => void;
}) {
  const isCreate = mode.kind === 'create';
  const create = useCreateDisplayMap();
  const update = useUpdateDisplayMap();
  const mutation = isCreate ? create : update;
  const pending = mutation.isPending;

  const [placeholderKey, setPlaceholderKey] = useState('chain');
  const [matchValue, setMatchValue] = useState(
    mode.kind === 'edit' ? mode.row.matchValue : '',
  );
  const [display, setDisplay] = useState(
    mode.kind === 'edit' ? mode.row.display : '',
  );

  const close = () => {
    if (pending) return;
    mutation.reset();
    onClose();
  };

  const submit = () => {
    if (isCreate) {
      create.mutate(
        { placeholderKey, matchValue, display },
        { onSuccess: close },
      );
    } else if (mode.kind === 'edit') {
      update.mutate(
        { id: mode.row.id, body: { matchValue, display } },
        { onSuccess: close },
      );
    }
  };

  return (
    <Modal
      isOpen
      onClose={close}
      title={isCreate ? 'Create display-map' : 'Edit display-map'}
      closeOnBackdropClick={!pending}
      closeOnEscape={!pending}
    >
      <div className="space-y-3">
        {isCreate && (
          <label className="block text-xs text-slate-400">
            Placeholder (immutable after create)
            <input
              data-testid="dexter-display-form-key"
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
              value={placeholderKey}
              onChange={(e) => setPlaceholderKey(e.target.value)}
              disabled={pending}
            />
          </label>
        )}
        <label className="block text-xs text-slate-400">
          Match value
          <input
            data-testid="dexter-display-form-match"
            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
            value={matchValue}
            onChange={(e) => setMatchValue(e.target.value)}
            disabled={pending}
          />
        </label>
        <label className="block text-xs text-slate-400">
          Display
          <input
            data-testid="dexter-display-form-display"
            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
            disabled={pending}
          />
        </label>
        {mutation.isError && (
          <div
            data-testid="dexter-display-form-error"
            className="text-xs text-red-400"
          >
            {englishMutationError(mutation.error)}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            data-testid="dexter-display-form-submit"
            disabled={
              pending || matchValue.trim() === '' || display.trim() === ''
            }
            onClick={submit}
          >
            {pending ? 'Saving…' : 'Confirm'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="dexter-display-form-cancel"
            disabled={pending}
            onClick={close}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DisplayMapRow({ row }: { row: DisplayMapView }) {
  const remove = useDeleteDisplayMap();
  const [modal, setModal] = useState<ModalMode>({ kind: 'closed' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li
      data-testid={`dexter-display-row-${row.id}`}
      className="border border-slate-800 rounded p-2 space-y-1"
    >
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <span className="text-slate-200">{row.placeholderKey}</span>
        <span className="text-slate-500">{row.matchValue}</span>
        <span className="text-slate-200">→</span>
        <span className="text-slate-200">
          {row.display === '' ? '—' : row.display}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          data-testid={`dexter-display-edit-${row.id}`}
          onClick={() => setModal({ kind: 'edit', row })}
        >
          Edit
        </Button>
        {!confirmDelete && (
          <Button
            size="sm"
            variant="danger"
            data-testid={`dexter-display-delete-${row.id}`}
            disabled={remove.isPending}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        )}
        {confirmDelete && (
          <span className="flex gap-2 items-center text-xs text-slate-400">
            Delete this row?
            <Button
              size="sm"
              variant="danger"
              data-testid={`dexter-display-delete-confirm-${row.id}`}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(row.id, {
                  onSuccess: () => setConfirmDelete(false),
                })
              }
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={remove.isPending}
              onClick={() => {
                remove.reset();
                setConfirmDelete(false);
              }}
            >
              Cancel
            </Button>
          </span>
        )}
      </div>
      {remove.isError && (
        <div
          data-testid={`dexter-display-row-error-${row.id}`}
          className="text-xs text-red-400"
        >
          {englishMutationError(remove.error)}
        </div>
      )}
      {modal.kind === 'edit' && (
        <DisplayMapFormModal
          mode={modal}
          onClose={() => setModal({ kind: 'closed' })}
        />
      )}
    </li>
  );
}

export function DisplayMapsSection() {
  const [filter, setFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const maps = useDisplayMaps(filter.trim() === '' ? undefined : filter.trim());
  const rows = Array.isArray(maps.data) ? maps.data : [];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-100">Display maps</h2>
        <input
          data-testid="dexter-display-filter"
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100"
          placeholder="Filter by placeholderKey"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button
          size="sm"
          data-testid="dexter-display-create"
          onClick={() => setModalOpen(true)}
        >
          Create
        </Button>
      </div>
      {maps.isPending && (
        <div
          data-testid="dexter-display-loading"
          className="text-xs text-slate-500 mt-2"
        >
          Loading…
        </div>
      )}
      {maps.isError && (
        <div
          data-testid="dexter-display-empty"
          className="text-xs text-slate-500 mt-2"
        >
          Display maps unavailable — is the dexter service up?
        </div>
      )}
      {maps.data && rows.length === 0 && (
        <div
          data-testid="dexter-display-empty"
          className="text-xs text-slate-500 mt-2"
        >
          No display maps
        </div>
      )}
      {maps.data && rows.length > 0 && (
        <ul
          data-testid="dexter-display-list"
          className="mt-2 space-y-2 text-sm"
        >
          {rows.map((row) => (
            <DisplayMapRow key={row.id} row={row} />
          ))}
        </ul>
      )}
      {modalOpen && (
        <DisplayMapFormModal
          mode={{ kind: 'create' }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </Card>
  );
}
