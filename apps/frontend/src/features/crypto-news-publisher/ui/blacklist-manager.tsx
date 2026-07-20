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
  initialAndGroupId: string | null;
  initialRequireMedia: boolean;
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
  initialAndGroupId,
  initialRequireMedia,
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
  const [isCompound, setIsCompound] = useState(initialAndGroupId !== null);
  const [requireMedia, setRequireMedia] = useState(initialRequireMedia);

  const canSubmit = phrase.trim().length > 0 && !pending;

  function handleClose() {
    if (pending) return;
    setPhrase(initialPhrase);
    setCaseSensitive(initialCaseSensitive);
    setSourceChannelIds(initialSourceChannelIds);
    setEnabled(initialEnabled);
    setMatchMode(initialMatchMode);
    setIsCompound(initialAndGroupId !== null);
    setRequireMedia(initialRequireMedia);
    onClose();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmedPhrase = phrase.trim();
    const andGroupId = isCompound
      ? (initialAndGroupId ?? crypto.randomUUID())
      : null;
    onSubmit({
      phrase: trimmedPhrase,
      caseSensitive,
      matchMode,
      enabled,
      sourceChannelIds:
        sourceChannelIds.length > 0 ? sourceChannelIds : undefined,
      andGroupId,
      requireMedia,
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

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isCompound}
              onChange={(e) => setIsCompound(e.target.checked)}
              disabled={pending}
            />
            <span>Compound (AND group)</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={requireMedia}
              onChange={(e) => setRequireMedia(e.target.checked)}
              disabled={pending}
            />
            <span>Require Media</span>
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // Group items: simple (andGroupId=null) vs compound (same andGroupId)
  const simpleItems = blacklist.filter((item) => item.andGroupId === null);
  const groupedByCompound = blacklist
    .filter((item) => item.andGroupId !== null)
    .reduce(
      (acc, item) => {
        const groupId = item.andGroupId!;
        if (!acc[groupId]) {
          acc[groupId] = [];
        }
        acc[groupId].push(item);
        return acc;
      },
      {} as Record<string, BlacklistPhraseView[]>,
    );
  const compoundGroups = Object.values(groupedByCompound).map((items) => ({
    id: items[0].andGroupId!,
    items: items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    enabled: items.every((i) => i.enabled),
  }));

  // Combined view: simple items + compound groups (paginated)
  const combinedItems: Array<
    | { type: 'simple'; item: BlacklistPhraseView }
    | { type: 'compound'; group: (typeof compoundGroups)[0] }
  > = [
    ...simpleItems.map((item) => ({ type: 'simple' as const, item })),
    ...compoundGroups.map((group) => ({ type: 'compound' as const, group })),
  ];
  combinedItems.sort((a, b) => {
    const dateA =
      a.type === 'simple'
        ? new Date(a.item.createdAt).getTime()
        : new Date(a.group.items[0].createdAt).getTime();
    const dateB =
      b.type === 'simple'
        ? new Date(b.item.createdAt).getTime()
        : new Date(b.group.items[0].createdAt).getTime();
    return dateB - dateA;
  });

  const totalPages = Math.ceil(combinedItems.length / PAGE_SIZE);

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

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

  function handleCompoundToggle(group: (typeof compoundGroups)[0]) {
    const newEnabled = !group.enabled;
    group.items.forEach((item) => {
      updateMut.mutate({
        id: item.id,
        body: { enabled: newEnabled },
      });
    });
  }

  function handleDelete(item: BlacklistPhraseView) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete blacklist phrase "${item.phrase}"?`);
      if (!ok) return;
    }
    deleteMut.mutate(item.id);
  }

  function handleCompoundDelete(group: (typeof compoundGroups)[0]) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        `Delete compound group with ${group.items.length} phrases?`,
      );
      if (!ok) return;
    }
    group.items.forEach((item) => {
      deleteMut.mutate(item.id);
    });
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
          Blacklist Phrases ({combinedItems.length})
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
        initialAndGroupId={null}
        initialRequireMedia={false}
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
        initialAndGroupId={editingItem?.andGroupId ?? null}
        initialRequireMedia={editingItem?.requireMedia ?? false}
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
      ) : combinedItems.length === 0 ? (
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
                <th className="py-2 pr-3">Case</th>
                <th className="py-2 pr-3">Sources</th>
                <th className="py-2 pr-3">Match</th>
                <th className="py-2 pr-3">Media</th>
                <th className="py-2 pr-3">Enabled</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {combinedItems
                .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                .map((entry) => {
                  if (entry.type === 'simple') {
                    const item = entry.item;
                    const hasMedia = item.requireMedia;
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-slate-800/60 last:border-0"
                      >
                        <td className="py-2 pr-3 font-mono text-slate-200 max-w-[200px] truncate">
                          {item.phrase}
                        </td>
                        <td className="py-2 pr-3 text-slate-400 text-xs">
                          {item.caseSensitive ? (
                            <span className="text-yellow-400">Aa</span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-300 max-w-[120px] truncate">
                          {sourceDisplay(item)}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="text-xs font-mono text-slate-400 uppercase">
                            {item.matchMode}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {hasMedia ? (
                            <span
                              className="text-xs text-cyan-400"
                              title="Requires media"
                            >
                              🎬
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
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
                    );
                  }

                  const group = entry.group;
                  const isExpanded = expandedGroups.has(group.id);

                  return (
                    <>
                      <tr
                        key={group.id}
                        className="border-b border-slate-700/80 bg-slate-800/40"
                      >
                        <td
                          className="py-2 pr-3 font-mono text-slate-200"
                          colSpan={8}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleGroup(group.id)}
                              className="text-slate-400 hover:text-slate-200 transition-colors"
                              aria-label={
                                isExpanded ? 'Collapse group' : 'Expand group'
                              }
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                            <span className="text-xs font-semibold uppercase text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                              Compound
                            </span>
                            <span className="text-sm text-slate-300">
                              {group.items.length} phrases
                            </span>
                            {group.items.some((i) => i.requireMedia) && (
                              <span className="text-xs text-cyan-400">🎬</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded &&
                        group.items.map((child) => (
                          <tr
                            key={child.id}
                            className="border-b border-slate-800/40 bg-slate-900/30"
                          >
                            <td className="py-1.5 pl-8 pr-3 font-mono text-slate-300 text-xs max-w-[200px] truncate">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase text-amber-500/70 font-semibold bg-amber-500/10 px-1 rounded">
                                  AND
                                </span>
                                <span>{child.phrase}</span>
                              </div>
                            </td>
                            <td className="py-1.5 pr-3 text-slate-400 text-xs">
                              {child.caseSensitive ? (
                                <span className="text-yellow-400">Aa</span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-1.5 pr-3 text-xs text-slate-400 max-w-[120px] truncate">
                              {sourceDisplay(child)}
                            </td>
                            <td className="py-1.5 pr-3">
                              <span className="text-xs font-mono text-slate-500 uppercase">
                                {child.matchMode}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3">
                              {child.requireMedia ? (
                                <span
                                  className="text-xs text-cyan-400"
                                  title="Requires media"
                                >
                                  🎬
                                </span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-1.5 pr-3">
                              <label className="inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={child.enabled}
                                  onChange={() => handleToggle(child)}
                                  disabled={updateMut.isPending}
                                  aria-label={`Toggle ${child.phrase}`}
                                />
                              </label>
                            </td>
                            <td className="py-1.5 pr-3 text-xs text-slate-500">
                              {new Date(child.createdAt).toLocaleString()}
                            </td>
                            <td className="py-1.5 pr-3 text-right">
                              <div className="inline-flex gap-1">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleOpenEdit(child)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleDelete(child)}
                                  disabled={deleteMut.isPending}
                                >
                                  Del
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      <tr className="border-b border-slate-800/60">
                        <td colSpan={8} className="py-1.5 px-3">
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={group.enabled}
                                onChange={() => handleCompoundToggle(group)}
                                disabled={updateMut.isPending}
                              />
                              <span>Toggle all</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleCompoundDelete(group)}
                              disabled={deleteMut.isPending}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
                            >
                              Delete group ({group.items.length})
                            </button>
                          </div>
                        </td>
                      </tr>
                    </>
                  );
                })}
            </tbody>
          </table>
          {combinedItems.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
              <span>
                {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, combinedItems.length)} of{' '}
                {combinedItems.length}
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
                  { length: Math.ceil(combinedItems.length / PAGE_SIZE) },
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
                  disabled={(page + 1) * PAGE_SIZE >= combinedItems.length}
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
