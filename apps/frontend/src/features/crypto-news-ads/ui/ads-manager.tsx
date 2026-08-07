import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card } from '@/shared/ui';
import { Modal } from '@/shared/ui/modal';
import {
  useAds,
  useCreateAd,
  useDeleteAd,
  useUpdateAd,
} from '@/features/crypto-news-ads/model/use-ads';
import type { AdView } from '@/features/crypto-news-ads/api/ads-api';

/**
 * Modal submit payload: unlike `CreateAdBody`, `expiresAt` is ALWAYS present
 * (`null` = explicit CLEAR, Metis R6.1). `handleCreateSubmit` maps `null` →
 * omitted for the create API; edit passes it through to `UpdateAdBody`.
 */
export interface AdModalSubmitBody {
  name: string;
  body: string;
  imagePath?: string;
  expiresAt: string | null;
  expirationAction: 'disable' | 'delete';
}

interface AdModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialName: string;
  initialBody: string;
  initialImagePath: string;
  initialExpiresAt: string | null;
  initialExpirationAction: 'disable' | 'delete';
  onSubmit: (body: AdModalSubmitBody) => void;
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
  initialExpiresAt,
  initialExpirationAction,
  onSubmit,
  pending,
  errorMessage,
}: AdModalProps): React.ReactElement {
  const [name, setName] = useState(initialName);
  const [body, setBody] = useState(initialBody);
  const [imagePath, setImagePath] = useState(initialImagePath);
  const [expiresAt, setExpiresAt] = useState(
    initialExpiresAt ? isoToLocalInput(initialExpiresAt) : '',
  );
  const [expirationAction, setExpirationAction] = useState<
    'disable' | 'delete'
  >(initialExpirationAction);

  // Reset form state when the modal opens so edits reflect the selected
  // ad instead of stale values from a previous mount.
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setBody(initialBody);
      setImagePath(initialImagePath);
      setExpiresAt(initialExpiresAt ? isoToLocalInput(initialExpiresAt) : '');
      setExpirationAction(initialExpirationAction);
    }
  }, [
    isOpen,
    initialName,
    initialBody,
    initialImagePath,
    initialExpiresAt,
    initialExpirationAction,
  ]);

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
    const expiresAtIso = localInputToIso(expiresAt);
    onSubmit({
      name: name.trim(),
      body: body.trim(),
      ...(trimmedImagePath !== '' ? { imagePath: trimmedImagePath } : {}),
      // Always include expiresAt: null = explicit CLEAR (Metis R6.1);
      // omitting it would silently keep the old expiry on edit.
      expiresAt: expiresAtIso,
      expirationAction,
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="ad-expires-at"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Expires at
            </label>
            <input
              id="ad-expires-at"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              disabled={pending}
            />
          </div>
          <div>
            <label
              htmlFor="ad-expiration-action"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              On expiry
            </label>
            <select
              id="ad-expiration-action"
              value={expirationAction}
              onChange={(e) =>
                setExpirationAction(e.target.value as 'disable' | 'delete')
              }
              disabled={pending}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="disable">Disable</option>
              <option value="delete">Delete</option>
            </select>
          </div>
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

/**
 * "Expires in" label rendered from an absolute ISO timestamp at render
 * time (no ticking interval — freshness comes from the useAds poll).
 * Rounding is floor-based per the pinned UI spec (Metis F5.4):
 *   null            -> "no limit"
 *   expiresAt <= now -> "expired"
 *   > 24h           -> "in Xd Yh"
 *   > 1h            -> "in Xh Ym"
 *   else            -> "in Xm"
 */
export function formatExpiresIn(expiresAt: string | null, now: Date): string {
  if (expiresAt === null) return 'no limit';
  const diffMs = new Date(expiresAt).getTime() - now.getTime();
  if (diffMs <= 0) return 'expired';
  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (diffMs > DAY) {
    return `in ${Math.floor(diffMs / DAY)}d ${Math.floor((diffMs % DAY) / HOUR)}h`;
  }
  if (diffMs > HOUR) {
    return `in ${Math.floor(diffMs / HOUR)}h ${Math.floor((diffMs % HOUR) / MINUTE)}m`;
  }
  return `in ${Math.floor(diffMs / MINUTE)}m`;
}

/** ISO (UTC) -> local `YYYY-MM-DDTHH:mm` for the datetime-local input. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local `YYYY-MM-DDTHH:mm` (or '') -> ISO UTC with seconds trimmed; '' -> null. */
export function localInputToIso(local: string): string | null {
  const trimmed = local.trim();
  if (trimmed === '') return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
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

  function handleCreateSubmit(body: AdModalSubmitBody) {
    createMut.mutate(
      {
        name: body.name,
        body: body.body,
        ...(body.imagePath ? { imagePath: body.imagePath } : {}),
        ...(body.expiresAt !== null ? { expiresAt: body.expiresAt } : {}),
        expirationAction: body.expirationAction,
      },
      {
        onSuccess: () => handleCloseModals(),
      },
    );
  }

  function handleEditSubmit(body: AdModalSubmitBody) {
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
    const index = ads.findIndex((a) => a.id === item.id);
    const target = ads[index + dir];
    if (!target) return;
    // Swap semantics: exchange order values with the adjacent ad so no
    // duplicate `order` values are ever produced (PATCHing order ± 1
    // collides with the neighbor's order).
    updateMut.mutate({ id: item.id, patch: { order: target.order } });
    updateMut.mutate({ id: target.id, patch: { order: item.order } });
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
        initialExpiresAt={null}
        initialExpirationAction="disable"
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
        initialExpiresAt={editingItem?.expiresAt ?? null}
        initialExpirationAction={editingItem?.expirationAction ?? 'disable'}
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
                <th className="py-2 pr-3">Expires</th>
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
                  <td className="py-2 pr-3 text-xs">
                    {item.expiresAt !== null &&
                    new Date(item.expiresAt).getTime() <= Date.now() ? (
                      <span className="inline-block px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 font-medium">
                        expired
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        {formatExpiresIn(item.expiresAt, new Date())}
                      </span>
                    )}
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
