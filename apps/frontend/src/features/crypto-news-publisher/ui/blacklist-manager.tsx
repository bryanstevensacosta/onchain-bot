import { useState, type FormEvent } from 'react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Modal } from '@/shared/ui/modal';
import {
  useBlacklist,
  useCreateBlacklist,
  useUpdateBlacklist,
  useDeleteBlacklist,
} from '../model/use-blacklist';
import {
  useCryptoNewsSources,
  type CryptoNewsSource,
} from '@/entities/crypto-news';
import { SourceMultiSelect } from './source-multi-select';
import type {
  BlacklistPhraseView,
  CreateBlacklistBody,
  UpdateBlacklistBody,
} from '../api/blacklist-api';

interface BlacklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialPhrase: string;
  initialCaseSensitive: boolean;
  initialMatchMode: 'exact' | 'substring';
  initialSourceChannelIds: string[];
  initialEnabled: boolean;
  sourceOptions: readonly CryptoNewsSource[];
  onSubmit: (body: CreateBlacklistBody | UpdateBlacklistBody) => void;
  pending: boolean;
  errorMessage: string | null;
}

function BlacklistModal({
  isOpen,
  onClose,
  title,
  initialPhrase,
  initialCaseSensitive,
  initialMatchMode,
  initialSourceChannelIds,
  initialEnabled,
  sourceOptions,
  onSubmit,
  pending,
  errorMessage,
}: BlacklistModalProps): React.ReactElement {
  const [phrase, setPhrase] = useState(initialPhrase);
  const [caseSensitive, setCaseSensitive] = useState(initialCaseSensitive);
  const [sourceChannelIds, setSourceChannelIds] = useState(
    initialSourceChannelIds,
  );
  const [enabled, setEnabled] = useState(initialEnabled);
  const [matchMode, setMatchMode] = useState<'exact' | 'substring'>(
    initialMatchMode,
  );

  const canSubmit = phrase.trim().length > 0 && !pending;

  function handleClose() {
    if (pending) return;
    setPhrase(initialPhrase);
    setCaseSensitive(initialCaseSensitive);
    setSourceChannelIds(initialSourceChannelIds);
    setEnabled(initialEnabled);
    setMatchMode(initialMatchMode);
    onClose();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmedPhrase = phrase.trim();
    onSubmit({
      phrase: trimmedPhrase,
      caseSensitive,
      matchMode,
      enabled,
      sourceChannelIds:
        sourceChannelIds.length > 0 ? sourceChannelIds : undefined,
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="bl-phrase"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Phrase <span className="text-red-400">*</span>
          </label>
          <input
            id="bl-phrase"
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="e.g. scam, rug pull, honeypot"
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            disabled={pending}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs uppercase text-slate-500 mb-1">
            Source Channels
          </label>
          <SourceMultiSelect
            ids={sourceChannelIds}
            onChange={setSourceChannelIds}
            sourceOptions={sourceOptions}
            disabled={pending}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              disabled={pending}
            />
            <span>Case sensitive</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase text-slate-500">Match</span>
            <select
              value={matchMode}
              onChange={(e) =>
                setMatchMode(e.target.value as 'exact' | 'substring')
              }
              disabled={pending}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="exact">Exact</option>
              <option value="substring">Substring</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={pending}
            />
            <span>Enabled</span>
          </label>
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

export function BlacklistManager(): React.ReactElement {
  const { data, isLoading, error } = useBlacklist();
  const createMut = useCreateBlacklist();
  const updateMut = useUpdateBlacklist();
  const deleteMut = useDeleteBlacklist();
  const { data: sources } = useCryptoNewsSources();

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BlacklistPhraseView | null>(
    null,
  );

  const blacklist = (data ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const totalPages = Math.ceil(blacklist.length / PAGE_SIZE);

  function handleOpenCreate() {
    setCreateModalOpen(true);
  }

  function handleOpenEdit(item: BlacklistPhraseView) {
    setEditingItem(item);
    setEditModalOpen(true);
  }

  function handleCloseModals() {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    setEditingItem(null);
  }

  function handleCreateSubmit(body: CreateBlacklistBody) {
    createMut.mutate(body, {
      onSuccess: () => handleCloseModals(),
    });
  }

  function handleEditSubmit(body: UpdateBlacklistBody) {
    if (!editingItem) return;
    updateMut.mutate(
      { id: editingItem.id, body },
      {
        onSuccess: () => handleCloseModals(),
      },
    );
  }

  function handleToggle(item: BlacklistPhraseView) {
    updateMut.mutate({ id: item.id, body: { enabled: !item.enabled } });
  }

  function handleDelete(item: BlacklistPhraseView) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete blacklist phrase "${item.phrase}"?`);
      if (!ok) return;
    }
    deleteMut.mutate(item.id);
  }

  function sourceDisplay(item: BlacklistPhraseView): string {
    if (item.sourceChannelIds.length === 0) return 'All sources';
    const sourceOptions = sources ?? [];
    return item.sourceChannelIds
      .map((id) => {
        const source = sourceOptions.find((s) => s.channelId === id);
        return source?.title ?? id;
      })
      .join(', ');
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">
          Blacklist Phrases ({blacklist.length})
        </h2>
        <Button variant="primary" size="sm" onClick={handleOpenCreate}>
          + Add Phrase
        </Button>
      </div>

      {createMut.error && (
        <div className="mb-3 text-sm text-red-400">
          Failed to add phrase: {String(createMut.error)}
        </div>
      )}

      <BlacklistModal
        isOpen={createModalOpen}
        onClose={handleCloseModals}
        title="Add Blacklist Phrase"
        initialPhrase=""
        initialCaseSensitive={false}
        initialMatchMode="exact"
        initialSourceChannelIds={[]}
        initialEnabled={true}
        sourceOptions={sources ?? []}
        onSubmit={handleCreateSubmit}
        pending={createMut.isPending}
        errorMessage={createMut.error?.message ?? null}
      />

      <BlacklistModal
        isOpen={editModalOpen}
        onClose={handleCloseModals}
        title="Edit Blacklist Phrase"
        initialPhrase={editingItem?.phrase ?? ''}
        initialCaseSensitive={editingItem?.caseSensitive ?? false}
        initialMatchMode={editingItem?.matchMode ?? 'substring'}
        initialSourceChannelIds={editingItem?.sourceChannelIds ?? []}
        initialEnabled={editingItem?.enabled ?? true}
        sourceOptions={sources ?? []}
        onSubmit={handleEditSubmit}
        pending={updateMut.isPending}
        errorMessage={updateMut.error?.message ?? null}
      />

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : error ? (
        <div className="text-sm text-red-400">
          Failed to load blacklist: {String(error)}
        </div>
      ) : blacklist.length === 0 ? (
        <div className="text-sm text-slate-500">
          No blacklist phrases yet. Add one above to start filtering crypto-news
          messages.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-700">
                <th className="py-2 pr-3">Phrase</th>
                <th className="py-2 pr-3">Case Sensitive</th>
                <th className="py-2 pr-3">Sources</th>
                <th className="py-2 pr-3">Match</th>
                <th className="py-2 pr-3">Enabled</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {blacklist
                .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                .map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-800/60 last:border-0"
                  >
                    <td className="py-2 pr-3 font-mono text-slate-200">
                      {item.phrase}
                    </td>
                    <td className="py-2 pr-3 text-slate-400">
                      {item.caseSensitive ? 'Yes' : 'No'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-300">
                      {sourceDisplay(item)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-xs font-mono text-slate-400 uppercase">
                        {item.matchMode}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleToggle(item)}
                          disabled={updateMut.isPending}
                          aria-label={`Toggle ${item.phrase}`}
                        />
                      </label>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {new Date(item.createdAt).toLocaleString()}
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
          {blacklist.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
              <span>
                {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, blacklist.length)} of{' '}
                {blacklist.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                {Array.from(
                  { length: Math.ceil(blacklist.length / PAGE_SIZE) },
                  (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i)}
                      className={`px-2 py-1 rounded border ${
                        i === page
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={(page + 1) * PAGE_SIZE >= blacklist.length}
                  onClick={() => setPage(page + 1)}
                  className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
