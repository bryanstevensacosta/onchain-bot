import { useState, type FormEvent } from 'react';
import { Button, Modal } from '@/shared/ui';
import { useCryptoNewsSources } from '../model/use-crypto-news-sources';
import { useAddCryptoNewsSource } from '../model/use-add-crypto-news-source';
import { useUpdateCryptoNewsSource } from '../model/use-update-crypto-news-source';
import { useDeleteCryptoNewsSource } from '../model/use-delete-crypto-news-source';

interface ManageCryptoNewsSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ViewMode = 'list' | 'add' | 'edit';

export function ManageCryptoNewsSourcesModal({
  isOpen,
  onClose,
}: ManageCryptoNewsSourcesModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState('');
  const [title, setTitle] = useState('');
  const [handle, setHandle] = useState('');

  const { data: sources, isLoading } = useCryptoNewsSources();
  const addMutation = useAddCryptoNewsSource();
  const updateMutation = useUpdateCryptoNewsSource();
  const deleteMutation = useDeleteCryptoNewsSource();

  const isSubmitting =
    addMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  function handleClose() {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }

  function resetForm() {
    setViewMode('list');
    setEditingChannelId(null);
    setChannelId('');
    setTitle('');
    setHandle('');
    addMutation.reset();
    updateMutation.reset();
    deleteMutation.reset();
  }

  function handleAddClick() {
    setViewMode('add');
    setChannelId('');
    setTitle('');
    setHandle('');
  }

  function handleEditClick(source: {
    channelId: string;
    title: string;
    handle: string | null;
  }) {
    setViewMode('edit');
    setEditingChannelId(source.channelId);
    setChannelId(source.channelId);
    setTitle(source.title);
    setHandle(source.handle || '');
  }

  function handleCancelForm() {
    resetForm();
  }

  async function handleSubmitAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = channelId.trim();
    if (!/^-100\d+$/.test(trimmed)) return;

    try {
      const input: { channelId: string; title?: string } = {
        channelId: trimmed,
      };
      if (title.trim()) {
        input.title = title.trim();
      }
      await addMutation.mutateAsync(input);
      resetForm();
    } catch {
      // error surfaced via mutation.error
    }
  }

  async function handleSubmitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingChannelId) return;

    try {
      await updateMutation.mutateAsync({
        channelId: editingChannelId,
        title: title.trim(),
        handle: handle.trim() || undefined,
      });
      resetForm();
    } catch {
      // error surfaced via mutation.error
    }
  }

  async function handleDelete(channelId: string) {
    if (!confirm('¿Eliminar este source?')) return;
    try {
      await deleteMutation.mutateAsync(channelId);
    } catch {
      // error surfaced via mutation.error
    }
  }

  const error =
    addMutation.error || updateMutation.error || deleteMutation.error;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Manage Sources"
      size="lg"
    >
      {viewMode === 'list' && (
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-slate-400">Cargando sources...</p>
          ) : sources && sources.length > 0 ? (
            <div className="space-y-2">
              {sources.map((source) => (
                <div
                  key={source.channelId}
                  className="group flex items-center justify-between bg-slate-800 border border-slate-700 rounded px-3 py-2 hover:border-slate-600 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">
                      {source.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {source.handle ? `@${source.handle}` : source.channelId}
                    </p>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleEditClick(source)}
                      disabled={isSubmitting}
                      className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(source.channelId)}
                      disabled={isSubmitting}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No hay sources registrados</p>
          )}

          {deleteMutation.isError && (
            <div
              role="alert"
              className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded px-3 py-2"
            >
              {deleteMutation.error.message}
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-slate-700">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleAddClick}
              disabled={isSubmitting}
            >
              + Add New Source
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {viewMode === 'add' && (
        <form onSubmit={handleSubmitAdd} className="space-y-4">
          <div>
            <label
              htmlFor="add-channelId"
              className="block text-xs uppercase text-slate-400 mb-1"
            >
              Telegram Channel ID
            </label>
            <input
              id="add-channelId"
              type="text"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="e.g. -1001234567890"
              autoFocus
              disabled={addMutation.isPending}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Channel ID must start with -100 prefix (Telegram channel format).
            </p>
          </div>

          <div>
            <label
              htmlFor="add-title"
              className="block text-xs uppercase text-slate-400 mb-1"
            >
              Title (optional)
            </label>
            <input
              id="add-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Crypto News Channel"
              disabled={addMutation.isPending}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              If not provided, title and handle will be auto-resolved from
              Telegram (bot must have joined the channel).
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded px-3 py-2"
            >
              {error.message}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCancelForm}
              disabled={addMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={
                !/^-100\d+$/.test(channelId.trim()) || addMutation.isPending
              }
            >
              {addMutation.isPending ? 'Adding…' : 'Add Source'}
            </Button>
          </div>
        </form>
      )}

      {viewMode === 'edit' && (
        <form onSubmit={handleSubmitEdit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase text-slate-400 mb-1">
              Channel ID
            </label>
            <input
              type="text"
              value={channelId}
              disabled
              className="w-full bg-slate-900 border border-slate-700 text-slate-500 text-sm rounded px-3 py-2 cursor-not-allowed"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Channel ID cannot be changed
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-title"
              className="block text-xs uppercase text-slate-400 mb-1"
            >
              Title
            </label>
            <input
              id="edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              disabled={updateMutation.isPending}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label
              htmlFor="edit-handle"
              className="block text-xs uppercase text-slate-400 mb-1"
            >
              Handle (optional)
            </label>
            <input
              id="edit-handle"
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="e.g. cryptonews (without @)"
              disabled={updateMutation.isPending}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded px-3 py-2"
            >
              {error.message}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCancelForm}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!title.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
