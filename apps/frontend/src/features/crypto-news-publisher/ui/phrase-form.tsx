import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '@/shared/ui/modal';
import { Button } from '@/shared/ui/button';
import { SourceMultiSelect } from '@/features/crypto-news-publisher/ui/source-multi-select';
import type { CryptoNewsSource } from '@/entities/crypto-news';
import { generateId } from '@/shared/lib/uuid';
import type { MatchMode } from '@/features/crypto-news-publisher/api/phrases-api';

export type PhraseType = 'keyword' | 'blacklist';

export interface PhraseFormData {
  phrase: string;
  caseSensitive: boolean;
  matchMode: MatchMode;
  sourceChannelIds: string[];
  enabled: boolean;
  andGroupId: string | null;
  requireMedia: boolean;
}

export interface PhraseFormProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  phraseType: PhraseType;
  initialData?: PhraseFormData;
  sourceOptions: readonly CryptoNewsSource[];
  compoundGroups: Array<{ id: string; label: string }>;
  onSubmit: (data: PhraseFormData) => void;
  pending: boolean;
  errorMessage: string | null;
  showTemplate?: boolean;
  templateOptions?: readonly { id: string; name: string }[];
  initialTemplateId?: string | null;
}

export function PhraseForm({
  isOpen,
  onClose,
  title,
  phraseType,
  initialData,
  sourceOptions,
  compoundGroups,
  onSubmit,
  pending,
  errorMessage,
  showTemplate = false,
  templateOptions = [],
  initialTemplateId = null,
}: PhraseFormProps): React.ReactElement {
  const [phrase, setPhrase] = useState(initialData?.phrase ?? '');
  const [caseSensitive, setCaseSensitive] = useState(
    initialData?.caseSensitive ?? false,
  );
  const [sourceChannelIds, setSourceChannelIds] = useState(
    initialData?.sourceChannelIds ?? [],
  );
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true);
  const [matchMode, setMatchMode] = useState<MatchMode>(
    initialData?.matchMode ?? 'exact',
  );
  const [compoundGroupId, setCompoundGroupId] = useState<string | null>(
    initialData?.andGroupId ?? null,
  );
  const [requireMedia, setRequireMedia] = useState(
    initialData?.requireMedia ?? false,
  );
  const [templateId, setTemplateId] = useState<string | null>(
    initialTemplateId,
  );

  // Reset form when modal opens/closes or initialData changes
  useEffect(() => {
    if (isOpen) {
      setPhrase(initialData?.phrase ?? '');
      setCaseSensitive(initialData?.caseSensitive ?? false);
      setSourceChannelIds(initialData?.sourceChannelIds ?? []);
      setEnabled(initialData?.enabled ?? true);
      setMatchMode(initialData?.matchMode ?? 'exact');
      setCompoundGroupId(initialData?.andGroupId ?? null);
      setRequireMedia(initialData?.requireMedia ?? false);
      setTemplateId(initialTemplateId);
    }
  }, [isOpen, initialData, initialTemplateId]);

  const canSubmit = phrase.trim().length > 0 && !pending;

  function handleClose() {
    if (pending) return;
    setPhrase('');
    setCaseSensitive(false);
    setSourceChannelIds([]);
    setEnabled(true);
    setMatchMode('exact');
    setCompoundGroupId(null);
    setRequireMedia(false);
    setTemplateId(null);
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
      sourceChannelIds: sourceChannelIds.length > 0 ? sourceChannelIds : [],
      andGroupId,
      requireMedia,
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="phrase-form-phrase"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Phrase <span className="text-red-400">*</span>
          </label>
          <input
            id="phrase-form-phrase"
            type="text"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={
              phraseType === 'keyword'
                ? 'e.g. SEC, ETF, halving'
                : 'e.g. scam, rug pull, honeypot'
            }
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

        {showTemplate && (
          <div>
            <label
              htmlFor="phrase-form-template"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Template
            </label>
            <select
              id="phrase-form-template"
              value={templateId ?? '__default__'}
              onChange={(e) =>
                setTemplateId(
                  e.target.value === '__default__' ? null : e.target.value,
                )
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={pending}
            >
              <option value="__default__">Use global default</option>
              {templateOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
              onChange={(e) => setMatchMode(e.target.value as MatchMode)}
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
