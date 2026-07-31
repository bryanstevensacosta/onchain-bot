import { useEffect, useState, type FormEvent } from 'react';
import { Card, Button, Modal } from '@/shared/ui';
import { generateId } from '@/shared/lib/uuid';
import {
  useCreateKeyword,
  useCreateKeywordBatch,
  useDeleteKeyword,
  useKeywords,
  useUpdateKeyword,
} from '@/features/crypto-news-publisher/model/use-keywords';
import { useTemplates } from '@/features/crypto-news-publisher/model/use-llm-config';
import { useCryptoNewsSources } from '@/entities/crypto-news';
import type {
  CreateKeywordBody,
  KeywordView,
  UpdateKeywordBody,
} from '@/features/crypto-news-publisher/api/keywords-api';
import type { CryptoNewsSource } from '@/entities/crypto-news';
import { SourceMultiSelect, templateLabel } from './source-multi-select';
import { CompoundGroupModal } from '@/features/crypto-news-publisher/ui/compound-group-modal';

const NO_TEMPLATE = '__default__';
const KW_PAGE_SIZE = 5;

/* ------------------------------------------------------------------ */
/*  Modal — shared add / edit form                                    */
/* ------------------------------------------------------------------ */

interface KeywordsModalProps {
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
  initialTemplateId: string | null;
  sourceOptions: readonly CryptoNewsSource[];
  templateOptions: readonly { id: string; name: string }[];
  compoundGroups: Array<{ id: string; label: string }>;
  onSubmit: (body: CreateKeywordBody | UpdateKeywordBody) => void;
  pending: boolean;
  errorMessage: string | null;
}

function KeywordsModal({
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
  initialTemplateId,
  sourceOptions,
  templateOptions,
  compoundGroups,
  onSubmit,
  pending,
  errorMessage,
}: KeywordsModalProps): React.ReactElement {
  const [phrase, setPhrase] = useState(initialPhrase);
  const [caseSensitive, setCaseSensitive] = useState(initialCaseSensitive);
  const [sourceChannelIds, setSourceChannelIds] = useState(
    initialSourceChannelIds,
  );
  const [enabled, setEnabled] = useState(initialEnabled);
  const [matchMode, setMatchMode] = useState<'exact' | 'substring'>(
    initialMatchMode,
  );
  const [templateId, setTemplateId] = useState<string | null>(
    initialTemplateId,
  );
  const [compoundGroupId, setCompoundGroupId] = useState<string | null>(
    initialAndGroupId,
  );
  const [requireMedia, setRequireMedia] = useState(initialRequireMedia);

  // Reset form state when the modal opens so edits reflect the selected
  // keyword instead of stale values from a previous mount.
  useEffect(() => {
    if (isOpen) {
      setPhrase(initialPhrase);
      setCaseSensitive(initialCaseSensitive);
      setSourceChannelIds(initialSourceChannelIds);
      setEnabled(initialEnabled);
      setMatchMode(initialMatchMode);
      setTemplateId(initialTemplateId);
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
    initialTemplateId,
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
    setTemplateId(initialTemplateId);
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
      templateId: templateId ?? null,
      andGroupId,
      requireMedia,
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="kw-phrase"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Phrase <span className="text-red-400">*</span>
          </label>
          <input
            id="kw-phrase"
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="e.g. SEC, ETF, halving"
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

        <div>
          <label
            htmlFor="kw-template-modal"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Template
          </label>
          <select
            id="kw-template-modal"
            value={templateId ?? NO_TEMPLATE}
            onChange={(e) =>
              setTemplateId(
                e.target.value === NO_TEMPLATE ? null : e.target.value,
              )
            }
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            disabled={pending}
          >
            <option value={NO_TEMPLATE}>Use global default</option>
            {templateOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface CompoundGroup {
  id: string;
  items: KeywordView[];
  enabled: boolean;
}

/** Build compound groups from a flat keyword list. */
function buildCompoundGroups(keywords: KeywordView[]): CompoundGroup[] {
  const grouped = keywords
    .filter((kw) => kw.andGroupId !== null)
    .reduce(
      (acc, kw) => {
        const gid = kw.andGroupId!;
        if (!acc[gid]) acc[gid] = [];
        acc[gid].push(kw);
        return acc;
      },
      {} as Record<string, KeywordView[]>,
    );

  return Object.values(grouped).map((items) => ({
    id: items[0].andGroupId!,
    items: items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
    enabled: items.every((i) => i.enabled),
  }));
}

type CombinedRow =
  | { type: 'simple'; item: KeywordView }
  | { type: 'compound'; group: CompoundGroup };

/** Merge simple items + compound groups, sorted newest-first. */
function buildCombinedRows(keywords: KeywordView[]): CombinedRow[] {
  const simple = keywords.filter((kw) => kw.andGroupId === null);
  const groups = buildCompoundGroups(keywords);

  const rows: CombinedRow[] = [
    ...simple.map((item) => ({ type: 'simple' as const, item })),
    ...groups.map((group) => ({ type: 'compound' as const, group })),
  ];

  rows.sort((a, b) => {
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

  return rows;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function KeywordsSection(): React.ReactElement {
  const { data: kwData, isLoading: kwLoading, error: kwError } = useKeywords();
  const createMut = useCreateKeyword();
  const updateMut = useUpdateKeyword();
  const deleteMut = useDeleteKeyword();
  const createBatchMut = useCreateKeywordBatch();
  const { data: templates } = useTemplates();
  const { data: sources } = useCryptoNewsSources();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [compoundModalOpen, setCompoundModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KeywordView | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [kwPage, setKwPage] = useState(0);
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);

  /* ------------------- data preparation ------------------- */

  const keywords = (kwData ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const q = searchQuery.toLowerCase().trim();
  const filteredKeywords = q
    ? keywords.filter((kw) => kw.phrase.toLowerCase().includes(q))
    : keywords;

  const combinedRows = buildCombinedRows(filteredKeywords);
  const compoundGroups = buildCompoundGroups(filteredKeywords).map((g) => ({
    id: g.id,
    label: `${g.items[0].phrase} (+${g.items.length - 1} more)`,
  }));
  const totalPages = Math.ceil(combinedRows.length / KW_PAGE_SIZE);

  useEffect(() => {
    if (kwPage >= totalPages && totalPages > 0) setKwPage(totalPages - 1);
  }, [filteredKeywords.length, kwPage, totalPages]);

  const templateOptions = templates ?? [];
  const sourceOptions = sources ?? [];

  /* --------------------- handlers ------------------------ */

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

  function handleOpenEdit(item: KeywordView) {
    setEditingItem(item);
    setEditModalOpen(true);
  }

  function handleCloseModals() {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    setEditingItem(null);
  }

  function handleCreateSubmit(body: CreateKeywordBody) {
    createMut.mutate(body, {
      onSuccess: () => handleCloseModals(),
    });
  }

  function handleEditSubmit(body: UpdateKeywordBody) {
    if (!editingItem) return;
    updateMut.mutate(
      { id: editingItem.id, body },
      {
        onSuccess: () => handleCloseModals(),
      },
    );
  }

  function handleToggle(item: KeywordView) {
    updateMut.mutate({ id: item.id, body: { enabled: !item.enabled } });
  }

  function handleCompoundToggle(group: CompoundGroup) {
    const newEnabled = !group.enabled;
    group.items.forEach((item) => {
      updateMut.mutate({
        id: item.id,
        body: { enabled: newEnabled },
      });
    });
  }

  function handleDelete(item: KeywordView) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete keyword "${item.phrase}"?`);
      if (!ok) return;
    }
    deleteMut.mutate(item.id);
  }

  function handleCompoundDelete(group: CompoundGroup) {
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
      templateId?: string | null;
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

  function sourceDisplay(
    item: KeywordView,
    sourceOpts: readonly CryptoNewsSource[],
  ): string {
    if (item.sourceChannelIds.length === 0) return 'All sources';
    return item.sourceChannelIds
      .map((id) => {
        const source = sourceOpts.find((s) => s.channelId === id);
        return source?.title ?? id;
      })
      .join(', ');
  }

  /* ------------------------ render ----------------------- */

  function handleAddPhrase(
    type:
      | 'keyword-simple'
      | 'keyword-compound'
      | 'blacklist-simple'
      | 'blacklist-compound',
  ) {
    setAddDropdownOpen(false);
    if (type === 'keyword-compound') {
      setCompoundModalOpen(true);
    } else if (type === 'blacklist-simple' || type === 'blacklist-compound') {
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('add-blacklist-phrase', {
          detail: { type },
        });
        window.dispatchEvent(event);
      }
    } else {
      setCreateModalOpen(true);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">
          Keywords ({keywords.length})
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
                  onClick={() => handleAddPhrase('keyword-simple')}
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Keyword (simple)
                </button>
                <button
                  type="button"
                  onClick={() => handleAddPhrase('keyword-compound')}
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Keyword (compound)
                </button>
                <div className="border-t border-slate-700 my-1" />
                <button
                  type="button"
                  onClick={() => handleAddPhrase('blacklist-simple')}
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Blacklist (simple)
                </button>
                <button
                  type="button"
                  onClick={() => handleAddPhrase('blacklist-compound')}
                  className="w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Blacklist (compound)
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Modals ---------- */}

      <KeywordsModal
        isOpen={createModalOpen}
        onClose={handleCloseModals}
        title="Add Keyword"
        initialPhrase=""
        initialCaseSensitive={false}
        initialMatchMode="exact"
        initialSourceChannelIds={[]}
        initialEnabled={true}
        initialAndGroupId={null}
        initialRequireMedia={false}
        initialTemplateId={null}
        sourceOptions={sourceOptions}
        templateOptions={templateOptions}
        compoundGroups={compoundGroups}
        onSubmit={handleCreateSubmit}
        pending={createMut.isPending}
        errorMessage={createMut.error?.message ?? null}
      />

      <KeywordsModal
        isOpen={editModalOpen}
        onClose={handleCloseModals}
        title="Edit Keyword"
        initialPhrase={editingItem?.phrase ?? ''}
        initialCaseSensitive={editingItem?.caseSensitive ?? false}
        initialMatchMode={editingItem?.matchMode ?? 'substring'}
        initialSourceChannelIds={editingItem?.sourceChannelIds ?? []}
        initialEnabled={editingItem?.enabled ?? true}
        initialAndGroupId={editingItem?.andGroupId ?? null}
        initialRequireMedia={editingItem?.requireMedia ?? false}
        initialTemplateId={editingItem?.templateId ?? null}
        sourceOptions={sourceOptions}
        templateOptions={templateOptions}
        compoundGroups={compoundGroups}
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
        sourceOptions={sourceOptions}
        showTemplate
        templateOptions={templateOptions}
        onSubmit={handleCompoundGroupSubmit}
        pending={createBatchMut.isPending}
        errorMessage={createBatchMut.error?.message ?? null}
      />

      {createMut.error && (
        <div className="mb-3 text-sm text-red-400">
          Failed to add keyword: {String(createMut.error)}
        </div>
      )}

      {/* ---------- Loading / empty ---------- */}

      {kwLoading ? (
        <div className="text-sm text-slate-500">Cargando...</div>
      ) : kwError ? (
        <div className="text-sm text-red-400">
          Failed to load keywords: {String(kwError)}
        </div>
      ) : keywords.length === 0 ? (
        <div className="text-sm text-slate-500">
          No keywords yet. Add one above to start matching crypto-news messages.
        </div>
      ) : (
        <>
          {/* ---------- Search ---------- */}
          <div className="mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setKwPage(0);
              }}
              placeholder="Search keywords…"
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {combinedRows.length === 0 ? (
            <div className="text-sm text-slate-500">
              No keywords match &quot;{searchQuery}&quot;.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-700">
                    <th className="py-2 pr-3">Phrase</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Case</th>
                    <th className="py-2 pr-3">Match</th>
                    <th className="py-2 pr-3">Enabled</th>
                    <th className="py-2 pr-3">Template</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedRows
                    .slice(kwPage * KW_PAGE_SIZE, (kwPage + 1) * KW_PAGE_SIZE)
                    .map((row) =>
                      row.type === 'simple' ? (
                        /* ---- Simple row ---- */
                        <tr
                          key={row.item.id}
                          className="border-b border-slate-800/60"
                        >
                          <td className="py-2 pr-3 font-mono text-slate-200">
                            <span className="inline-flex items-center gap-1">
                              {row.item.phrase}
                              {row.item.requireMedia && (
                                <span
                                  className="text-xs"
                                  title="Requires media attachment"
                                >
                                  🎬
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-xs text-slate-300">
                            {sourceDisplay(row.item, sourceOptions)}
                          </td>
                          <td className="py-2 pr-3 text-slate-400">
                            {row.item.caseSensitive ? 'Yes' : 'No'}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="text-xs font-mono text-slate-400 uppercase">
                              {row.item.matchMode}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <label className="inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={row.item.enabled}
                                onChange={() => handleToggle(row.item)}
                                disabled={updateMut.isPending}
                                aria-label={`Toggle ${row.item.phrase}`}
                              />
                            </label>
                          </td>
                          <td className="py-2 pr-3 text-xs text-slate-300">
                            {templateLabel(
                              row.item.templateId,
                              templateOptions,
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs text-slate-500">
                            {new Date(row.item.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <div className="inline-flex gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenEdit(row.item)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDelete(row.item)}
                                disabled={deleteMut.isPending}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        /* ---- Compound group ---- */
                        <CompoundRow
                          key={row.group.id}
                          group={row.group}
                          isExpanded={expandedGroups.has(row.group.id)}
                          onToggleExpand={() => toggleGroup(row.group.id)}
                          onToggle={() => handleCompoundToggle(row.group)}
                          onEdit={() => handleOpenEdit(row.group.items[0])}
                          onDelete={() => handleCompoundDelete(row.group)}
                          sourceOptions={sourceOptions}
                          templateOptions={templateOptions}
                          updatePending={updateMut.isPending}
                          deletePending={deleteMut.isPending}
                        />
                      ),
                    )}
                </tbody>
              </table>

              {/* ---------- Pagination ---------- */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
                  <span>
                    {kwPage * KW_PAGE_SIZE + 1}–
                    {Math.min((kwPage + 1) * KW_PAGE_SIZE, combinedRows.length)}{' '}
                    of {combinedRows.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={kwPage === 0}
                      onClick={() => setKwPage(kwPage - 1)}
                      className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setKwPage(i)}
                        className={`px-2 py-1 rounded border ${
                          i === kwPage
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={
                        (kwPage + 1) * KW_PAGE_SIZE >= combinedRows.length
                      }
                      onClick={() => setKwPage(kwPage + 1)}
                      className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Compound group row (expandable)                                    */
/* ------------------------------------------------------------------ */

interface CompoundRowProps {
  group: CompoundGroup;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  sourceOptions: readonly CryptoNewsSource[];
  templateOptions: readonly { id: string; name: string }[];
  updatePending: boolean;
  deletePending: boolean;
}

function CompoundRow({
  group,
  isExpanded,
  onToggleExpand,
  onToggle,
  onEdit,
  onDelete,
  sourceOptions,
  templateOptions,
  updatePending,
  deletePending,
}: CompoundRowProps): React.ReactElement {
  return (
    <>
      {/* Parent row */}
      <tr className="border-b border-slate-800/60 bg-slate-800/40">
        <td className="py-2 pr-3 font-mono text-slate-200" colSpan={1}>
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex items-center gap-1.5 text-slate-300 hover:text-slate-100 transition-colors"
            aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
          >
            <span
              className={`text-xs transition-transform ${
                isExpanded ? 'rotate-90' : ''
              }`}
            >
              ▶
            </span>
            <span className="text-xs bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded font-sans">
              Compound: {group.items.length} phrases
            </span>
          </button>
        </td>
        <td className="py-2 pr-3 text-xs text-slate-500">Group</td>
        <td className="py-2 pr-3 text-slate-400">—</td>
        <td className="py-2 pr-3">—</td>
        <td className="py-2 pr-3">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={group.enabled}
              onChange={onToggle}
              disabled={updatePending}
              aria-label={`Toggle compound group`}
            />
          </label>
        </td>
        <td className="py-2 pr-3 text-xs text-slate-500">—</td>
        <td className="py-2 pr-3 text-xs text-slate-500">
          {new Date(group.items[0].createdAt).toLocaleString()}
        </td>
        <td className="py-2 pr-3 text-right">
          <div className="inline-flex gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={onDelete}
              disabled={deletePending}
            >
              Delete
            </Button>
          </div>
        </td>
      </tr>

      {/* Expanded children */}
      {isExpanded &&
        group.items.map((item) => (
          <tr
            key={item.id}
            className="border-b border-slate-800/40 bg-slate-900/40"
          >
            <td className="py-1.5 pr-3 pl-8 font-mono text-slate-300 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-blue-400 font-sans">
                  AND
                </span>
                {item.phrase}
                {item.requireMedia && (
                  <span className="text-xs" title="Requires media attachment">
                    🎬
                  </span>
                )}
              </span>
            </td>
            <td className="py-1.5 pr-3 text-xs text-slate-400">
              {sourceDisplay(item, sourceOptions)}
            </td>
            <td className="py-1.5 pr-3 text-xs text-slate-500">
              {item.caseSensitive ? 'Yes' : 'No'}
            </td>
            <td className="py-1.5 pr-3">
              <span className="text-[10px] font-mono text-slate-500 uppercase">
                {item.matchMode}
              </span>
            </td>
            <td className="py-1.5 pr-3">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  disabled
                  className="opacity-60"
                  aria-label={`Sub-phrase ${item.phrase} enabled`}
                />
              </label>
            </td>
            <td className="py-1.5 pr-3 text-xs text-slate-500">
              {templateLabel(item.templateId, templateOptions)}
            </td>
            <td className="py-1.5 pr-3 text-xs text-slate-500">
              {new Date(item.createdAt).toLocaleString()}
            </td>
            <td className="py-1.5 pr-3 text-right">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  /* Re-open the edit modal for this sub-item */
                  /* handled by the parent row's Edit button */
                }}
              >
                Edit
              </Button>
            </td>
          </tr>
        ))}
    </>
  );
}

/* Re-export helper used by the page */
function sourceDisplay(
  item: { sourceChannelIds: string[] },
  sourceOpts: readonly CryptoNewsSource[],
): string {
  if (item.sourceChannelIds.length === 0) return 'All sources';
  return item.sourceChannelIds
    .map((id) => {
      const source = sourceOpts.find((s) => s.channelId === id);
      return source?.title ?? id;
    })
    .join(', ');
}
