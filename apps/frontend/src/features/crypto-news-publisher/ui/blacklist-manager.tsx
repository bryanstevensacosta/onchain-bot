import { useState, useEffect, type FormEvent } from 'react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Modal } from '@/shared/ui/modal';
import { generateId } from '@/shared/lib/uuid';
import {
  useBlacklist,
  useCreateBlacklist,
  useUpdateBlacklist,
  useDeleteBlacklist,
  useCreateBlacklistBatch,
} from '../model/use-blacklist';
import { CompoundGroupModal } from '@/features/crypto-news-publisher/ui/compound-group-modal';
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
  compoundGroups: Array<{ id: string; label: string }>;
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
  compoundGroups,
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
  const [compoundGroupId, setCompoundGroupId] = useState<string | null>(
    initialAndGroupId,
  );
  const [requireMedia, setRequireMedia] = useState(initialRequireMedia);

  // Reset form state when the modal opens so edits reflect the selected
  // phrase instead of stale values from a previous mount.
  useEffect(() => {
    if (isOpen) {
      setPhrase(initialPhrase);
      setCaseSensitive(initialCaseSensitive);
      setSourceChannelIds(initialSourceChannelIds);
      setEnabled(initialEnabled);
      setMatchMode(initialMatchMode);
      setCompoundGroupId(initialAndGroupId);
      setRequireMedia(initialRequireMedia);
    }
  }, [
    isOpen,
    initialPhrase,
    initialCaseSensitive,
    initialSourceChannelIds,
    initialEnabled,
    initialMatchMode,
    initialAndGroupId,
    initialRequireMedia,
  ]);

  const canSubmit = phrase.trim().length > 0 && !pending;

  function handleClose() {
    if (pending) return;
    setPhrase(initialPhrase);
    setCaseSensitive(initialCaseSensitive);
    setSourceChannelIds(initialSourceChannelIds);
    setEnabled(initialEnabled);
    setMatchMode(initialMatchMode);
    setCompoundGroupId(initialAndGroupId);
    setRequireMedia(initialRequireMedia);
    onClose();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmedPhrase = phrase.trim();
    const isNewCompound = compoundGroupId === '__new__';
    const andGroupId = isNewCompound ? generateId() : compoundGroupId;
    onSubmit({
      phrase: trimmedPhrase,
      caseSensitive,
      matchMode,
      enabled,
      sourceChannelIds,
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
            <span className="text-xs uppercase text-slate-500">Compound</span>
            <select
              value={compoundGroupId ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setCompoundGroupId(val === '' ? null : val);
              }}
              disabled={pending}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500 min-w-[160px]"
            >
              <option value="">None (OR)</option>
              {compoundGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
              <option value="__new__">+ Create new compound group</option>
            </select>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [compoundModalOpen, setCompoundModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BlacklistPhraseView | null>(
    null,
  );
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);

  const createBatchMut = useCreateBlacklistBatch();

  useEffect(() => {
    const handleAddBlacklistPhrase = (e: Event) => {
      const customEvent = e as CustomEvent<{ type: string }>;
      if (customEvent.detail?.type === 'blacklist-simple') {
        setCreateModalOpen(true);
      } else if (customEvent.detail?.type === 'blacklist-compound') {
        setCompoundModalOpen(true);
      }
    };
    window.addEventListener('add-blacklist-phrase', handleAddBlacklistPhrase);
    return () => {
      window.removeEventListener(
        'add-blacklist-phrase',
        handleAddBlacklistPhrase,
      );
    };
  }, []);

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
  const compoundGroupOptions = compoundGroups.map((g) => ({
    id: g.id,
    label: `${g.items[0].phrase} (+${g.items.length - 1} more)`,
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

  const q = searchQuery.toLowerCase().trim();
  const filteredItems = q
    ? combinedItems.filter((entry) => {
        const phrase =
          entry.type === 'simple'
            ? entry.item.phrase
            : entry.group.items.map((i) => i.phrase).join(' ');
        return phrase.toLowerCase().includes(q);
      })
    : combinedItems;

  const _totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);

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

  function handleCompoundGroupSubmit(
    phrases: ReadonlyArray<{
      phrase: string;
      caseSensitive?: boolean;
      matchMode?: 'exact' | 'substring';
      sourceChannelIds?: string[];
      enabled?: boolean;
      requireMedia?: boolean;
    }>,
  ) {
    const body = {
      phrases: phrases.map((p) => ({
        ...p,
        sourceChannelIds: p.sourceChannelIds,
      })),
    };
    createBatchMut.mutateAsync(body).then(() => setCompoundModalOpen(false));
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
          Blacklist Phrases ({filteredItems.length}/{combinedItems.length})
        </h2>
        <div className="relative">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAddDropdownOpen(!addDropdownOpen)}
          >
            + Add Phrase
            <svg
              className="w-3 h-3 ml-1 inline-block"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </Button>
          {addDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setAddDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-1 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-20 py-1">
                <button
                  type="button"
                  onClick={() => {
                    setAddDropdownOpen(false);
                    setCreateModalOpen(true);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Blacklist (simple)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddDropdownOpen(false);
                    setCompoundModalOpen(true);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Blacklist (compound)
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {createMut.error && (
        <div className="mb-3 text-sm text-red-400">
          Failed to add phrase: {String(createMut.error)}
        </div>
      )}

      {/* ---------- Search ---------- */}
      <div className="mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search blacklist phrases…"
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

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
        compoundGroups={compoundGroupOptions}
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
        compoundGroups={compoundGroupOptions}
        onSubmit={handleEditSubmit}
        pending={updateMut.isPending}
        errorMessage={updateMut.error?.message ?? null}
      />

      <CompoundGroupModal
        isOpen={compoundModalOpen}
        onClose={() => {
          setCompoundModalOpen(false);
          createBatchMut.reset();
        }}
        title="Add Compound Group"
        sourceOptions={sources ?? []}
        onSubmit={handleCompoundGroupSubmit}
        pending={createBatchMut.isPending}
        errorMessage={createBatchMut.error?.message ?? null}
      />

      {isLoading ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : error ? (
        <div className="text-sm text-red-400">
          Failed to load blacklist: {String(error)}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-sm text-slate-500">
          {q
            ? `No blacklist phrases match "${searchQuery}".`
            : 'No blacklist phrases yet. Add one above to start filtering crypto-news messages.'}
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
              {filteredItems
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
          {filteredItems.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
              <span>
                {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, filteredItems.length)} of{' '}
                {filteredItems.length}
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
                  { length: Math.ceil(filteredItems.length / PAGE_SIZE) },
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
                  disabled={(page + 1) * PAGE_SIZE >= filteredItems.length}
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
