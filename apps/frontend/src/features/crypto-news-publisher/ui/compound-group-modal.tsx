import { useState } from 'react';
import { Modal } from '@/shared/ui/modal';
import { Button } from '@/shared/ui/button';
import { SourceMultiSelect } from './source-multi-select';
import type { CryptoNewsSource } from '@/entities/crypto-news';
import { generateId } from '@/shared/lib/uuid';

export interface PhraseRow {
  id: string;
  phrase: string;
  caseSensitive: boolean;
  matchMode: 'exact' | 'substring';
  enabled: boolean;
  requireMedia: boolean;
}

export interface CompoundGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  sourceOptions: readonly CryptoNewsSource[];
  showTemplate?: boolean;
  templateOptions?: readonly { id: string; name: string }[];
  onSubmit: (
    phrases: ReadonlyArray<{
      phrase: string;
      caseSensitive?: boolean;
      matchMode?: 'exact' | 'substring';
      sourceChannelIds?: string[];
      enabled?: boolean;
      requireMedia?: boolean;
      templateId?: string | null;
    }>,
  ) => void;
  pending: boolean;
  errorMessage: string | null;
}

function createEmptyRow(): PhraseRow {
  return {
    id: generateId(),
    phrase: '',
    caseSensitive: false,
    matchMode: 'substring',
    enabled: true,
    requireMedia: false,
  };
}

export function CompoundGroupModal({
  isOpen,
  onClose,
  title,
  sourceOptions,
  showTemplate = false,
  templateOptions = [],
  onSubmit,
  pending,
  errorMessage,
}: CompoundGroupModalProps): React.ReactElement {
  const [rows, setRows] = useState<PhraseRow[]>([
    createEmptyRow(),
    createEmptyRow(),
  ]);
  const [sourceChannelIds, setSourceChannelIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);

  const resetState = () => {
    setRows([createEmptyRow(), createEmptyRow()]);
    setSourceChannelIds([]);
    setEnabled(true);
    setTemplateId(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 2) return;
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const updateRow = (id: string, updates: Partial<PhraseRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phrases = rows.map((row) => ({
      phrase: row.phrase,
      caseSensitive: row.caseSensitive,
      matchMode: row.matchMode,
      sourceChannelIds,
      enabled,
      requireMedia: row.requireMedia,
      templateId: showTemplate ? templateId : undefined,
    }));
    onSubmit(phrases);
  };

  const canSubmit = rows.some((row) => row.phrase.trim() !== '');

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs uppercase text-slate-500 mb-1">
            Source Channels
          </label>
          <SourceMultiSelect
            ids={sourceChannelIds}
            onChange={setSourceChannelIds}
            sourceOptions={sourceOptions.map((s) => ({
              channelId: s.channelId,
              title: s.title,
              handle: s.handle,
            }))}
            disabled={pending}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={pending}
            />
            <span>Enabled</span>
          </label>
          {showTemplate && templateOptions.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-xs uppercase text-slate-500">Template</span>
              <select
                value={templateId ?? ''}
                onChange={(e) =>
                  setTemplateId(e.target.value === '' ? null : e.target.value)
                }
                disabled={pending}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="">Default</option>
                {templateOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-start gap-2 p-2 bg-slate-800/50 rounded border border-slate-700/50"
            >
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={row.phrase}
                  onChange={(e) =>
                    updateRow(row.id, { phrase: e.target.value })
                  }
                  placeholder="Enter phrase..."
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  disabled={pending}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={row.caseSensitive}
                      onChange={(e) =>
                        updateRow(row.id, { caseSensitive: e.target.checked })
                      }
                      disabled={pending}
                    />
                    <span>Case</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="text-[10px] uppercase">Match</span>
                    <select
                      value={row.matchMode}
                      onChange={(e) =>
                        updateRow(row.id, {
                          matchMode: e.target.value as 'exact' | 'substring',
                        })
                      }
                      disabled={pending}
                      className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      <option value="exact">Exact</option>
                      <option value="substring">Substring</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={row.requireMedia}
                      onChange={(e) =>
                        updateRow(row.id, { requireMedia: e.target.checked })
                      }
                      disabled={pending}
                    />
                    <span>Media</span>
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={rows.length <= 2 || pending}
                className="p-1 text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Remove phrase"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          disabled={pending}
          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
        >
          + Add phrase
        </button>

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
            {pending ? 'Saving…' : `Create Group (${rows.length})`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
