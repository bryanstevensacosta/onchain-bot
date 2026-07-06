import { useState } from 'react';
import { Button, Card } from '@/shared/ui';
import {
  useCreateKeyword,
  useDeleteKeyword,
  useKeywords,
  useUpdateKeyword,
} from '@/features/crypto-news-publisher/model/use-keywords';
import type { KeywordView } from '@/features/crypto-news-publisher/api/keywords-api';

interface EditingRow {
  id: string;
  phrase: string;
}

export function KeywordsManager(): React.ReactElement {
  const { data, isLoading, error } = useKeywords();
  const createMut = useCreateKeyword();
  const updateMut = useUpdateKeyword();
  const deleteMut = useDeleteKeyword();

  const [newPhrase, setNewPhrase] = useState('');
  const [newCaseSensitive, setNewCaseSensitive] = useState(false);
  const [editing, setEditing] = useState<EditingRow | null>(null);

  const keywords = data ?? [];

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const phrase = newPhrase.trim();
    if (!phrase) return;
    createMut.mutate(
      { phrase, caseSensitive: newCaseSensitive },
      {
        onSuccess: () => {
          setNewPhrase('');
          setNewCaseSensitive(false);
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
      { id: editing.id, body: { phrase } },
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
        className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-slate-800"
      >
        <div className="flex-1 min-w-[200px]">
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
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={newCaseSensitive}
            onChange={(e) => setNewCaseSensitive(e.target.checked)}
            disabled={createMut.isPending}
          />
          <span>Case sensitive</span>
        </label>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={createMut.isPending || newPhrase.trim() === ''}
        >
          {createMut.isPending ? 'Adding…' : '+ Add keyword'}
        </Button>
      </form>

      {createMut.error && (
        <div className="mb-3 text-sm text-red-400">
          Failed to add keyword: {String(createMut.error)}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-slate-500">Cargando...</div>
      ) : error ? (
        <div className="text-sm text-red-400">
          Failed to load keywords: {String(error)}
        </div>
      ) : keywords.length === 0 ? (
        <div className="text-sm text-slate-500">
          No keywords yet. Add one above to start matching crypto-news messages.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-700">
                <th className="py-2 pr-3">Phrase</th>
                <th className="py-2 pr-3">Case sensitive</th>
                <th className="py-2 pr-3">Enabled</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((kw) => {
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
                            setEditing({ id: kw.id, phrase: e.target.value })
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                          disabled={updateMut.isPending}
                        />
                      ) : (
                        kw.phrase
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-400">
                      {kw.caseSensitive ? 'Yes' : 'No'}
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
                              setEditing({ id: kw.id, phrase: kw.phrase })
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
        </div>
      )}
    </Card>
  );
}
