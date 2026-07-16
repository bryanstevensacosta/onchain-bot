import { useEffect, useState } from 'react';
import { Button, Card } from '@/shared/ui';
import {
  useCreateKeyword,
  useDeleteKeyword,
  useKeywords,
  useUpdateKeyword,
} from '@/features/crypto-news-publisher/model/use-keywords';
import { useTemplates } from '@/features/crypto-news-publisher/model/use-llm-config';
import { useCryptoNewsSources } from '@/entities/crypto-news';
import type { KeywordView } from '@/features/crypto-news-publisher/api/keywords-api';
import type { PromptTemplate } from '@/features/crypto-news-publisher/api/llm-config-api';
import {
  useBlacklist,
  useCreateBlacklist,
  useUpdateBlacklist,
  useDeleteBlacklist,
} from '@/features/crypto-news-publisher/model/use-blacklist';
import type { BlacklistPhraseView } from '@/features/crypto-news-publisher/api/blacklist-api';

interface EditingRow {
  id: string;
  phrase: string;
  sourceChannelIds: string[];
  templateId: string | null;
  requireImage: boolean;
  matchMode: 'exact' | 'substring';
}

interface BlacklistEditingRow {
  id: string;
  phrase: string;
  sourceChannelIds: string[];
  caseSensitive: boolean;
  enabled: boolean;
  matchMode: 'exact' | 'substring';
}

const NO_TEMPLATE = '__default__';

interface SourceOption {
  channelId: string;
  title: string | null;
  handle: string | null;
}

function sourceLabel(s: SourceOption): string {
  return s.title ?? s.handle ?? s.channelId;
}

function SourceMultiSelect({
  ids,
  onChange,
  sourceOptions,
  disabled,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  sourceOptions: ReadonlyArray<SourceOption>;
  disabled?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const isGlobal = ids.length === 0;

  const label = isGlobal
    ? 'All sources (global)'
    : ids.length === 1
      ? sourceOptions.find((s) => s.channelId === ids[0])
        ? sourceLabel(sourceOptions.find((s) => s.channelId === ids[0])!)
        : '1 source'
      : `${ids.length} sources`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
      >
        <span className="truncate">{label}</span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
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
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            ref={(el) => {
              if (!el || typeof window === 'undefined') return;
              const btn = el.parentElement?.querySelector('button');
              if (!btn) return;
              const rect = btn.getBoundingClientRect();
              el.style.position = 'fixed';
              el.style.top = `${rect.bottom + 4}px`;
              el.style.left = `${rect.left}px`;
              el.style.width = `${rect.width}px`;
            }}
            className="z-20 max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded shadow-lg p-1.5 space-y-0.5"
          >
            <label className="flex items-center gap-2 px-2 py-1 rounded text-sm text-slate-300 cursor-pointer hover:bg-slate-700/50">
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={() => onChange([])}
                disabled={disabled}
              />
              <span className="italic text-slate-400">
                All sources (global)
              </span>
            </label>
            {sourceOptions.map((s) => (
              <label
                key={s.channelId}
                className="flex items-center gap-2 px-2 py-1 rounded text-sm text-slate-300 cursor-pointer hover:bg-slate-700/50"
              >
                <input
                  type="checkbox"
                  checked={ids.includes(s.channelId)}
                  onChange={() =>
                    onChange(
                      ids.includes(s.channelId)
                        ? ids.filter((id) => id !== s.channelId)
                        : [...ids, s.channelId],
                    )
                  }
                  disabled={disabled}
                />
                <span>{sourceLabel(s)}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function templateLabel(
  templateId: string | null,
  templates: ReadonlyArray<PromptTemplate>,
): string {
  if (templateId === null) return 'Default';
  const found = templates.find((t) => t.id === templateId);
  return found
    ? `Template: ${found.name}`
    : `Template: ${templateId.slice(0, 8)}…`;
}

export function KeywordsManager(): React.ReactElement {
  // ── Keywords state ──
  const { data: kwData, isLoading: kwLoading, error: kwError } = useKeywords();
  const createMut = useCreateKeyword();
  const updateMut = useUpdateKeyword();
  const deleteMut = useDeleteKeyword();
  const { data: templates } = useTemplates();
  const { data: sources } = useCryptoNewsSources();

  const [newPhrase, setNewPhrase] = useState('');
  const [newCaseSensitive, setNewCaseSensitive] = useState(false);
  const [newRequireImage, setNewRequireImage] = useState(false);
  const [newSourceChannelIds, setNewSourceChannelIds] = useState<string[]>([]);
  const [newTemplateId, setNewTemplateId] = useState<string | null>(null);
  const [newMatchMode, setNewMatchMode] = useState<'exact' | 'substring'>(
    'exact',
  );
  const [editing, setEditing] = useState<EditingRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [kwPage, setKwPage] = useState(0);
  const KW_PAGE_SIZE = 5;

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

  const newPhraseTrimmed = newPhrase.trim();
  const isDuplicate =
    newPhraseTrimmed.length > 0
      ? keywords.some(
          (kw) => kw.phrase.toLowerCase() === newPhraseTrimmed.toLowerCase(),
        )
      : false;

  const kwTotalPages = Math.ceil(filteredKeywords.length / KW_PAGE_SIZE);
  useEffect(() => {
    if (kwPage >= kwTotalPages && kwTotalPages > 0) setKwPage(kwTotalPages - 1);
  }, [filteredKeywords.length, kwPage, kwTotalPages]);
  const templateOptions = templates ?? [];
  const sourceOptions = sources ?? [];

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const phrase = newPhrase.trim();
    if (!phrase) return;
    createMut.mutate(
      {
        phrase,
        caseSensitive: newCaseSensitive,
        sourceChannelIds: newSourceChannelIds,
        templateId: newTemplateId,
        requireImage: newRequireImage,
        matchMode: newMatchMode,
      },
      {
        onSuccess: () => {
          setNewPhrase('');
          setNewCaseSensitive(false);
          setNewRequireImage(false);
          setNewSourceChannelIds([]);
          setNewTemplateId(null);
          setNewMatchMode('exact');
        },
      },
    );
  }

  function handleToggle(kw: KeywordView) {
    updateMut.mutate({ id: kw.id, body: { enabled: !kw.enabled } });
  }

  function handleSaveEdit() {
    if (!editing) return;
    const phrase = editing.phrase.trim();
    if (!phrase) return;
    updateMut.mutate(
      {
        id: editing.id,
        body: {
          phrase,
          sourceChannelIds: editing.sourceChannelIds,
          templateId: editing.templateId,
          requireImage: editing.requireImage,
          matchMode: editing.matchMode,
        },
      },
      { onSuccess: () => setEditing(null) },
    );
  }

  function handleDelete(kw: KeywordView) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete keyword "${kw.phrase}"?`);
      if (!ok) return;
    }
    deleteMut.mutate(kw.id);
  }

  // ── Blacklist state ──
  const { data: blData, isLoading: blLoading, error: blError } = useBlacklist();
  const blCreateMut = useCreateBlacklist();
  const blUpdateMut = useUpdateBlacklist();
  const blDeleteMut = useDeleteBlacklist();

  const [blNewPhrase, setBlNewPhrase] = useState('');
  const [blNewSourceChannelIds, setBlNewSourceChannelIds] = useState<string[]>(
    [],
  );
  const [blNewMatchMode, setBlNewMatchMode] = useState<'exact' | 'substring'>(
    'exact',
  );
  const [blNewCaseSensitive, setBlNewCaseSensitive] = useState(false);
  const [blNewEnabled, setBlNewEnabled] = useState(true);
  const [blEditing, setBlEditing] = useState<BlacklistEditingRow | null>(null);
  const [blSearchQuery, setBlSearchQuery] = useState('');
  const [blPage, setBlPage] = useState(0);
  const BL_PAGE_SIZE = 5;

  const blacklist = (blData ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const blQ = blSearchQuery.toLowerCase().trim();
  const filteredBlacklist = blQ
    ? blacklist.filter((bl) => bl.phrase.toLowerCase().includes(blQ))
    : blacklist;

  const blNewPhraseTrimmed = blNewPhrase.trim();
  const blIsDuplicate =
    blNewPhraseTrimmed.length > 0
      ? blacklist.some(
          (bl) => bl.phrase.toLowerCase() === blNewPhraseTrimmed.toLowerCase(),
        )
      : false;

  const blTotalPages = Math.ceil(filteredBlacklist.length / BL_PAGE_SIZE);
  useEffect(() => {
    if (blPage >= blTotalPages && blTotalPages > 0) setBlPage(blTotalPages - 1);
  }, [filteredBlacklist.length, blPage, blTotalPages]);

  function handleBlCreate(e: React.FormEvent) {
    e.preventDefault();
    const phrase = blNewPhrase.trim();
    if (!phrase) return;
    blCreateMut.mutate(
      {
        phrase,
        matchMode: blNewMatchMode,
        caseSensitive: blNewCaseSensitive,
        enabled: blNewEnabled,
        sourceChannelIds:
          blNewSourceChannelIds.length > 0 ? blNewSourceChannelIds : undefined,
      },
      {
        onSuccess: () => {
          setBlNewPhrase('');
          setBlNewSourceChannelIds([]);
          setBlNewMatchMode('exact');
          setBlNewCaseSensitive(false);
          setBlNewEnabled(true);
        },
      },
    );
  }

  function handleBlToggle(item: BlacklistPhraseView) {
    blUpdateMut.mutate({ id: item.id, body: { enabled: !item.enabled } });
  }

  function handleBlSaveEdit() {
    if (!blEditing) return;
    const phrase = blEditing.phrase.trim();
    if (!phrase) return;
    blUpdateMut.mutate(
      {
        id: blEditing.id,
        body: {
          phrase,
          sourceChannelIds:
            blEditing.sourceChannelIds.length > 0
              ? blEditing.sourceChannelIds
              : undefined,
          caseSensitive: blEditing.caseSensitive,
          enabled: blEditing.enabled,
          matchMode: blEditing.matchMode,
        },
      },
      { onSuccess: () => setBlEditing(null) },
    );
  }

  function handleBlDelete(item: BlacklistPhraseView) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete blacklist phrase "${item.phrase}"?`);
      if (!ok) return;
    }
    blDeleteMut.mutate(item.id);
  }

  function sourceDisplay(
    item: BlacklistPhraseView,
    srcOptions: ReadonlyArray<SourceOption>,
  ): string {
    if (item.sourceChannelIds.length === 0) return 'All sources';
    return item.sourceChannelIds
      .map((id) => {
        const source = srcOptions.find((s) => s.channelId === id);
        return source?.title ?? id;
      })
      .join(', ');
  }

  return (
    <Card>
      {/* ════════════════════════════════════════════════ */}
      {/* KEYWORDS SECTION                                */}
      {/* ════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">
          Keywords ({keywords.length})
        </h2>
      </div>

      <form
        onSubmit={handleCreate}
        className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 pb-4 border-b border-slate-800"
      >
        <div className="md:col-span-2">
          <label
            htmlFor="kw-phrase"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Phrase
          </label>
          <input
            id="kw-phrase"
            type="text"
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
            placeholder="e.g. SEC, ETF, halving"
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            disabled={createMut.isPending}
          />
          {isDuplicate && (
            <span className="text-xs text-red-400 mt-1 block">
              Esa keyword ya existe
            </span>
          )}
        </div>
        <div>
          <label
            htmlFor="kw-template"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Template
          </label>
          <select
            id="kw-template"
            value={newTemplateId ?? NO_TEMPLATE}
            onChange={(e) =>
              setNewTemplateId(
                e.target.value === NO_TEMPLATE ? null : e.target.value,
              )
            }
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            disabled={createMut.isPending}
          >
            <option value={NO_TEMPLATE}>Use global default</option>
            {templateOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-500 mb-1">
            Sources
          </label>
          <SourceMultiSelect
            ids={newSourceChannelIds}
            onChange={setNewSourceChannelIds}
            sourceOptions={sourceOptions}
            disabled={createMut.isPending}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={newCaseSensitive}
              onChange={(e) => setNewCaseSensitive(e.target.checked)}
              disabled={createMut.isPending}
            />
            <span>Case sensitive</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={newRequireImage}
              onChange={(e) => setNewRequireImage(e.target.checked)}
              disabled={createMut.isPending}
            />
            <span>Only with image</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase text-slate-500">Match</span>
            <select
              value={newMatchMode}
              onChange={(e) =>
                setNewMatchMode(e.target.value as 'exact' | 'substring')
              }
              disabled={createMut.isPending}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="exact">Exact</option>
              <option value="substring">Substring</option>
            </select>
          </label>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={
              createMut.isPending || newPhraseTrimmed === '' || isDuplicate
            }
          >
            {createMut.isPending ? 'Adding…' : '+ Add keyword'}
          </Button>
        </div>
      </form>

      {createMut.error && (
        <div className="mb-3 text-sm text-red-400">
          Failed to add keyword: {String(createMut.error)}
        </div>
      )}

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
          {filteredKeywords.length === 0 ? (
            <div className="text-sm text-slate-500">
              No keywords match "{searchQuery}".
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
                  {filteredKeywords
                    .slice(kwPage * KW_PAGE_SIZE, (kwPage + 1) * KW_PAGE_SIZE)
                    .map((kw) => {
                      const isEditing = editing?.id === kw.id;
                      return (
                        <tr
                          key={kw.id}
                          className="border-b border-slate-800/60 last:border-0"
                        >
                          <td className="py-2 pr-3 font-mono text-slate-200">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editing!.phrase}
                                onChange={(e) =>
                                  setEditing({
                                    ...editing!,
                                    phrase: e.target.value,
                                  })
                                }
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                                disabled={updateMut.isPending}
                              />
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                {kw.phrase}
                                {kw.requireImage && (
                                  <span
                                    title="Only enqueue messages with images"
                                    aria-label="Only with image"
                                  >
                                    📷
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            {isEditing ? (
                              <SourceMultiSelect
                                ids={editing!.sourceChannelIds}
                                onChange={(ids) =>
                                  setEditing({
                                    ...editing!,
                                    sourceChannelIds: ids,
                                  })
                                }
                                sourceOptions={sourceOptions}
                                disabled={updateMut.isPending}
                              />
                            ) : (
                              <span className="text-xs text-slate-300">
                                {kw.sourceChannelIds.length === 0
                                  ? 'Global'
                                  : kw.sourceChannelIds
                                      .map(
                                        (id) =>
                                          sourceOptions.find(
                                            (s) => s.channelId === id,
                                          )?.title ?? id,
                                      )
                                      .join(', ')}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-slate-400">
                            {isEditing ? (
                              <label className="flex items-center gap-2 text-xs text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={editing!.requireImage}
                                  onChange={(e) =>
                                    setEditing({
                                      ...editing!,
                                      requireImage: e.target.checked,
                                    })
                                  }
                                  disabled={updateMut.isPending}
                                />
                                <span>Only with image</span>
                              </label>
                            ) : kw.caseSensitive ? (
                              'Yes'
                            ) : (
                              'No'
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            {isEditing ? (
                              <select
                                value={editing!.matchMode}
                                onChange={(e) =>
                                  setEditing({
                                    ...editing!,
                                    matchMode: e.target.value as
                                      | 'exact'
                                      | 'substring',
                                  })
                                }
                                disabled={updateMut.isPending}
                                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                              >
                                <option value="exact">Exact</option>
                                <option value="substring">Substring</option>
                              </select>
                            ) : (
                              <span className="text-xs font-mono text-slate-400 uppercase">
                                {kw.matchMode}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <label className="inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={kw.enabled}
                                onChange={() => handleToggle(kw)}
                                disabled={updateMut.isPending}
                                aria-label={`Toggle ${kw.phrase}`}
                              />
                            </label>
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {isEditing ? (
                              <select
                                value={editing!.templateId ?? NO_TEMPLATE}
                                onChange={(e) =>
                                  setEditing({
                                    ...editing!,
                                    templateId:
                                      e.target.value === NO_TEMPLATE
                                        ? null
                                        : e.target.value,
                                  })
                                }
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                                disabled={updateMut.isPending}
                              >
                                <option value={NO_TEMPLATE}>
                                  Use global default
                                </option>
                                {templateOptions.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-slate-300">
                                {templateLabel(kw.templateId, templateOptions)}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs text-slate-500">
                            {new Date(kw.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {isEditing ? (
                              <div className="inline-flex gap-2">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={handleSaveEdit}
                                  disabled={
                                    updateMut.isPending ||
                                    editing!.phrase.trim() === ''
                                  }
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditing(null)}
                                  disabled={updateMut.isPending}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="inline-flex gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() =>
                                    setEditing({
                                      id: kw.id,
                                      phrase: kw.phrase,
                                      sourceChannelIds: kw.sourceChannelIds,
                                      templateId: kw.templateId,
                                      requireImage: kw.requireImage,
                                      matchMode: kw.matchMode,
                                    })
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleDelete(kw)}
                                  disabled={deleteMut.isPending}
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {filteredKeywords.length > KW_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
                  <span>
                    {kwPage * KW_PAGE_SIZE + 1}–
                    {Math.min(
                      (kwPage + 1) * KW_PAGE_SIZE,
                      filteredKeywords.length,
                    )}{' '}
                    of {filteredKeywords.length}
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
                    {Array.from(
                      {
                        length: Math.ceil(
                          filteredKeywords.length / KW_PAGE_SIZE,
                        ),
                      },
                      (_, i) => (
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
                      ),
                    )}
                    <button
                      type="button"
                      disabled={
                        (kwPage + 1) * KW_PAGE_SIZE >= filteredKeywords.length
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

      {/* ════════════════════════════════════════════════ */}
      {/* DIVIDER                                        */}
      {/* ════════════════════════════════════════════════ */}
      <hr className="my-6 border-slate-700" />

      {/* ════════════════════════════════════════════════ */}
      {/* BLACKLIST SECTION                               */}
      {/* ════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">
          Blacklist Phrases ({blacklist.length})
        </h2>
      </div>

      <form
        onSubmit={handleBlCreate}
        className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 pb-4 border-b border-slate-800"
      >
        <div className="md:col-span-2">
          <label
            htmlFor="bl-phrase"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Phrase
          </label>
          <input
            id="bl-phrase"
            type="text"
            value={blNewPhrase}
            onChange={(e) => setBlNewPhrase(e.target.value)}
            placeholder="e.g. scam, rug pull, honeypot"
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            disabled={blCreateMut.isPending}
          />
          {blIsDuplicate && (
            <span className="text-xs text-red-400 mt-1 block">
              This phrase already exists
            </span>
          )}
        </div>
        <div>
          <label className="block text-xs uppercase text-slate-500 mb-1">
            Sources
          </label>
          <SourceMultiSelect
            ids={blNewSourceChannelIds}
            onChange={setBlNewSourceChannelIds}
            sourceOptions={sourceOptions}
            disabled={blCreateMut.isPending}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span className="text-xs uppercase text-slate-500">Match</span>
            <select
              value={blNewMatchMode}
              onChange={(e) =>
                setBlNewMatchMode(e.target.value as 'exact' | 'substring')
              }
              disabled={blCreateMut.isPending}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="exact">Exact</option>
              <option value="substring">Substring</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={blNewCaseSensitive}
              onChange={(e) => setBlNewCaseSensitive(e.target.checked)}
              disabled={blCreateMut.isPending}
            />
            <span>Case sensitive</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={blNewEnabled}
              onChange={(e) => setBlNewEnabled(e.target.checked)}
              disabled={blCreateMut.isPending}
            />
            <span>Enabled</span>
          </label>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={
              blCreateMut.isPending ||
              blNewPhraseTrimmed === '' ||
              blIsDuplicate
            }
          >
            {blCreateMut.isPending ? 'Adding…' : '+ Add phrase'}
          </Button>
        </div>
      </form>

      {blCreateMut.error && (
        <div className="mb-3 text-sm text-red-400">
          Failed to add phrase: {String(blCreateMut.error)}
        </div>
      )}

      {blLoading ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : blError ? (
        <div className="text-sm text-red-400">
          Failed to load blacklist: {String(blError)}
        </div>
      ) : blacklist.length === 0 ? (
        <div className="text-sm text-slate-500">
          No blacklist phrases yet. Add one above to start filtering crypto-news
          messages.
        </div>
      ) : (
        <>
          <div className="mb-3">
            <input
              type="text"
              value={blSearchQuery}
              onChange={(e) => {
                setBlSearchQuery(e.target.value);
                setBlPage(0);
              }}
              placeholder="Search blacklist phrases…"
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          {filteredBlacklist.length === 0 ? (
            <div className="text-sm text-slate-500">
              No blacklist phrases match "{blSearchQuery}".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-700">
                    <th className="py-2 pr-3">Phrase</th>
                    <th className="py-2 pr-3">Match</th>
                    <th className="py-2 pr-3">Sources</th>
                    <th className="py-2 pr-3">Case Sensitive</th>
                    <th className="py-2 pr-3">Enabled</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBlacklist
                    .slice(blPage * BL_PAGE_SIZE, (blPage + 1) * BL_PAGE_SIZE)
                    .map((item) => {
                      const isBlEditing = blEditing?.id === item.id;
                      return (
                        <tr
                          key={item.id}
                          className="border-b border-slate-800/60 last:border-0"
                        >
                          <td className="py-2 pr-3 font-mono text-slate-200">
                            {isBlEditing ? (
                              <input
                                type="text"
                                value={blEditing!.phrase}
                                onChange={(e) =>
                                  setBlEditing({
                                    ...blEditing!,
                                    phrase: e.target.value,
                                  })
                                }
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                                disabled={blUpdateMut.isPending}
                              />
                            ) : (
                              item.phrase
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            {isBlEditing ? (
                              <select
                                value={blEditing!.matchMode}
                                onChange={(e) =>
                                  setBlEditing({
                                    ...blEditing!,
                                    matchMode: e.target.value as
                                      | 'exact'
                                      | 'substring',
                                  })
                                }
                                disabled={blUpdateMut.isPending}
                                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                              >
                                <option value="exact">Exact</option>
                                <option value="substring">Substring</option>
                              </select>
                            ) : (
                              <span className="text-xs font-mono text-slate-400 uppercase">
                                {item.matchMode}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs text-slate-300">
                            {isBlEditing ? (
                              <SourceMultiSelect
                                ids={blEditing!.sourceChannelIds}
                                onChange={(ids) =>
                                  setBlEditing({
                                    ...blEditing!,
                                    sourceChannelIds: ids,
                                  })
                                }
                                sourceOptions={sourceOptions}
                                disabled={blUpdateMut.isPending}
                              />
                            ) : (
                              sourceDisplay(item, sourceOptions)
                            )}
                          </td>
                          <td className="py-2 pr-3 text-slate-400">
                            {isBlEditing ? (
                              <label className="flex items-center gap-2 text-xs text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={blEditing!.caseSensitive}
                                  onChange={(e) =>
                                    setBlEditing({
                                      ...blEditing!,
                                      caseSensitive: e.target.checked,
                                    })
                                  }
                                  disabled={blUpdateMut.isPending}
                                />
                                <span>Case sensitive</span>
                              </label>
                            ) : item.caseSensitive ? (
                              'Yes'
                            ) : (
                              'No'
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <label className="inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.enabled}
                                onChange={() => handleBlToggle(item)}
                                disabled={blUpdateMut.isPending}
                                aria-label={`Toggle blacklist ${item.phrase}`}
                              />
                            </label>
                          </td>
                          <td className="py-2 pr-3 text-xs text-slate-500">
                            {new Date(item.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {isBlEditing ? (
                              <div className="inline-flex gap-2">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={handleBlSaveEdit}
                                  disabled={
                                    blUpdateMut.isPending ||
                                    blEditing!.phrase.trim() === ''
                                  }
                                >
                                  Save
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setBlEditing(null)}
                                  disabled={blUpdateMut.isPending}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="inline-flex gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() =>
                                    setBlEditing({
                                      id: item.id,
                                      phrase: item.phrase,
                                      sourceChannelIds: item.sourceChannelIds,
                                      caseSensitive: item.caseSensitive,
                                      enabled: item.enabled,
                                      matchMode: item.matchMode,
                                    })
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleBlDelete(item)}
                                  disabled={blDeleteMut.isPending}
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {filteredBlacklist.length > BL_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
                  <span>
                    {blPage * BL_PAGE_SIZE + 1}–
                    {Math.min(
                      (blPage + 1) * BL_PAGE_SIZE,
                      filteredBlacklist.length,
                    )}{' '}
                    of {filteredBlacklist.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={blPage === 0}
                      onClick={() => setBlPage(blPage - 1)}
                      className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    {Array.from(
                      {
                        length: Math.ceil(
                          filteredBlacklist.length / BL_PAGE_SIZE,
                        ),
                      },
                      (_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setBlPage(i)}
                          className={`px-2 py-1 rounded border ${
                            i === blPage
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
                      disabled={
                        (blPage + 1) * BL_PAGE_SIZE >= filteredBlacklist.length
                      }
                      onClick={() => setBlPage(blPage + 1)}
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
