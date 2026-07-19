import { useEffect, useState, type FormEvent } from 'react';
import { Card, Button } from '@/shared/ui';
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
  SourceMultiSelect,
  sourceLabel,
  templateLabel,
  type SourceOption,
} from './source-multi-select';

const NO_TEMPLATE = '__default__';

interface EditingRow {
  id: string;
  phrase: string;
  sourceChannelIds: string[];
  templateId: string | null;
  requireImage: boolean;
  matchMode: 'exact' | 'substring';
}

export function KeywordsSection(): React.ReactElement {
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

  return (
    <Card>
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
    </Card>
  );
}
