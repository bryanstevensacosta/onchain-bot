import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card } from '@/shared/ui';
import { Modal } from '@/shared/ui/modal';
import {
  useAds,
  useCreateAd,
  useDeleteAd,
  useUpdateAd,
} from '@/features/crypto-news-ads/model/use-ads';
import type {
  AdView,
  CreateAdBody,
} from '@/features/crypto-news-ads/api/ads-api';

interface AdModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialName: string;
  initialBody: string;
  initialImagePath: string;
  onSubmit: (body: CreateAdBody) => void;
  pending: boolean;
  errorMessage: string | null;
}

function AdModal({
  isOpen,
  onClose,
  title,
  initialName,
  initialBody,
  initialImagePath,
  onSubmit,
  pending,
  errorMessage,
}: AdModalProps): React.ReactElement {
  const [name, setName] = useState(initialName);
  const [body, setBody] = useState(initialBody);
  const [imagePath, setImagePath] = useState(initialImagePath);

  // Reset form state when the modal opens so edits reflect the selected
  // ad instead of stale values from a previous mount.
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setBody(initialBody);
      setImagePath(initialImagePath);
    }
  }, [isOpen, initialName, initialBody, initialImagePath]);

  const canSubmit =
    name.trim().length > 0 && body.trim().length > 0 && !pending;

  function handleClose() {
    if (pending) return;
    onClose();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmedImagePath = imagePath.trim();
    onSubmit({
      name: name.trim(),
      body: body.trim(),
      ...(trimmedImagePath !== '' ? { imagePath: trimmedImagePath } : {}),
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="ad-name"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="ad-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Pump alpha banner"
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            disabled={pending}
            autoFocus
          />
        </div>

        <div>
          <label
            htmlFor="ad-body"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Body <span className="text-red-400">*</span>
          </label>
          <textarea
            id="ad-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ad copy sent to the output channel"
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            disabled={pending}
          />
        </div>

        <div>
          <label
            htmlFor="ad-image-path"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Image path
          </label>
          <input
            id="ad-image-path"
            type="text"
            value={imagePath}
            onChange={(e) => setImagePath(e.target.value)}
            placeholder="/path/to/image.jpg (optional)"
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            disabled={pending}
          />
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded px-3 py-2"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
          >
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function formatLastPublished(lastPublishedAt: string | null): string {
  if (!lastPublishedAt) return 'never';
  return new Date(lastPublishedAt).toLocaleString();
}

export function AdsManager(): React.ReactElement {
  const { data, isLoading, error } = useAds();
  const createMut = useCreateAd();
  const updateMut = useUpdateAd();
  const deleteMut = useDeleteAd();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdView | null>(null);

  const ads = (data ?? [])
    .slice()
    .sort(
      (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
    );

  function handleOpenEdit(item: AdView) {
    setEditingItem(item);
    setEditModalOpen(true);
  }

  function handleCloseModals() {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    setEditingItem(null);
  }

  function handleCreateSubmit(body: CreateAdBody) {
    createMut.mutate(body, {
      onSuccess: () => handleCloseModals(),
    });
  }

  function handleEditSubmit(body: CreateAdBody) {
    if (!editingItem) return;
    updateMut.mutate(
      { id: editingItem.id, patch: body },
      {
        onSuccess: () => handleCloseModals(),
      },
    );
  }

  function handleToggle(item: AdView) {
    updateMut.mutate({ id: item.id, patch: { enabled: !item.enabled } });
  }

  function handleMove(item: AdView, dir: -1 | 1) {
    updateMut.mutate({ id: item.id, patch: { order: item.order + dir } });
  }

  function handleDelete(item: AdView) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete ad "${item.name}"?`);
      if (!ok) return;
    }
    deleteMut.mutate(item.id);
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">
          Ads ({ads.length})
        </h2>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setCreateModalOpen(true)}
        >
          + Add Ad
        </Button>
      </div>

      {createMut.error && (
        <div className="mb-3 text-sm text-red-400">
          Failed to add ad: {String(createMut.error)}
        </div>
      )}

      <AdModal
        isOpen={createModalOpen}
        onClose={handleCloseModals}
        title="Add Ad"
        initialName=""
        initialBody=""
        initialImagePath=""
        onSubmit={handleCreateSubmit}
        pending={createMut.isPending}
        errorMessage={createMut.error?.message ?? null}
      />

      <AdModal
        isOpen={editModalOpen}
        onClose={handleCloseModals}
        title="Edit Ad"
        initialName={editingItem?.name ?? ''}
        initialBody={editingItem?.body ?? ''}
        initialImagePath={editingItem?.imagePath ?? ''}
        onSubmit={handleEditSubmit}
        pending={updateMut.isPending}
        errorMessage={updateMut.error?.message ?? null}
      />

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : error ? (
        <div className="text-sm text-red-400">
          Failed to load ads: {String(error)}
        </div>
      ) : ads.length === 0 ? (
        <div className="text-sm text-slate-500">
          No ads yet. Add one above to start rotating sponsored content.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-700">
                <th className="py-2 pr-3">Order</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Enabled</th>
                <th className="py-2 pr-3">Published</th>
                <th className="py-2 pr-3">Last published</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((item, index) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-800/60 last:border-0"
                >
                  <td className="py-2 pr-3">
                    <div className="inline-flex items-center gap-1">
                      <span className="text-xs text-slate-500 w-4">
                        {item.order}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleMove(item, -1)}
                        disabled={index === 0 || updateMut.isPending}
                        aria-label={`Move ${item.name} up`}
                        className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs leading-none"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(item, 1)}
                        disabled={
                          index === ads.length - 1 || updateMut.isPending
                        }
                        aria-label={`Move ${item.name} down`}
                        className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs leading-none"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-slate-200 max-w-[180px] truncate">
                    {item.name}
                  </td>
                  <td className="py-2 pr-3">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={() => handleToggle(item)}
                        disabled={updateMut.isPending}
                        aria-label={`Toggle ${item.name}`}
                      />
                    </label>
                  </td>
                  <td className="py-2 pr-3 text-slate-300">
                    {item.timesPublished}
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-500">
                    {formatLastPublished(item.lastPublishedAt)}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenEdit(item)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(item)}
                        disabled={deleteMut.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
