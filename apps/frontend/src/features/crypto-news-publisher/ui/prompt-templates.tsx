import { useMemo, useState } from 'react';
import { Button, Card, Modal } from '@/shared/ui';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useLlmConfig,
  useLlmModels,
  useTemplates,
  useUpdateTemplate,
} from '@/features/crypto-news-publisher/model/use-llm-config';
import { useKeywords } from '@/features/crypto-news-publisher/model/use-keywords';
import type {
  CreatePromptTemplateBody,
  LlmModel,
  PromptTemplate,
  ReasoningEffort,
  UpdatePromptTemplateBody,
} from '@/features/crypto-news-publisher/api/llm-config-api';

interface FormState {
  name: string;
  description: string;
  model: string;
  maxTokens: string;
  temperature: string;
  reasoningEffort: ReasoningEffort;
  promptText: string;
}

const REASONING_OPTIONS: ReadonlyArray<{
  value: ReasoningEffort;
  label: string;
}> = [
  { value: null, label: '(none)' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
];

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  model: '',
  maxTokens: '2000',
  temperature: '0.7',
  reasoningEffort: null,
  promptText: '',
};

function formFromTemplate(t: PromptTemplate): FormState {
  return {
    name: t.name,
    description: t.description ?? '',
    model: t.model,
    maxTokens: String(t.maxTokens),
    temperature: String(t.temperature),
    reasoningEffort: t.reasoningEffort,
    promptText: t.promptText,
  };
}

function buildBody(form: FormState): CreatePromptTemplateBody {
  return {
    name: form.name.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    model: form.model,
    maxTokens: Number(form.maxTokens),
    temperature: Number(form.temperature),
    reasoningEffort: form.reasoningEffort,
    promptText: form.promptText,
  };
}

function isValid(form: FormState): boolean {
  if (form.name.trim().length === 0 || form.name.length > 100) return false;
  if (form.model.trim().length === 0 || form.model.length > 200) return false;
  if (form.promptText.trim().length === 0) return false;
  const maxTokens = Number(form.maxTokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8000) {
    return false;
  }
  const temperature = Number(form.temperature);
  if (Number.isNaN(temperature) || temperature < 0 || temperature > 2) {
    return false;
  }
  return true;
}

function renderModelOptions(
  models: ReadonlyArray<LlmModel>,
  currentId: string,
): React.ReactNode {
  const byOwner = new Map<string, LlmModel[]>();
  const orphans: LlmModel[] = [];
  for (const m of models) {
    if (m.ownedBy) {
      const list = byOwner.get(m.ownedBy) ?? [];
      list.push(m);
      byOwner.set(m.ownedBy, list);
    } else {
      orphans.push(m);
    }
  }
  const owners = Array.from(byOwner.keys()).sort();
  return (
    <>
      {currentId && !models.some((m) => m.id === currentId) && (
        <option value={currentId}>{currentId} (not in gateway list)</option>
      )}
      {owners.map((owner) => (
        <optgroup key={owner} label={owner}>
          {byOwner.get(owner)!.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </optgroup>
      ))}
      {orphans.length > 0 && (
        <optgroup label="other">
          {orphans.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

interface TemplateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initial: FormState;
  title: string;
  submitLabel: string;
  onSubmit: (body: CreatePromptTemplateBody | UpdatePromptTemplateBody) => void;
  pending: boolean;
  errorMessage: string | null;
  models: ReadonlyArray<LlmModel>;
}

function TemplateFormModal({
  isOpen,
  onClose,
  initial,
  title,
  submitLabel,
  onSubmit,
  pending,
  errorMessage,
  models,
}: TemplateFormModalProps): React.ReactElement {
  const [form, setForm] = useState<FormState>(initial);

  const canSubmit = isValid(form) && !pending;

  function handleClose() {
    if (pending) return;
    setForm(initial);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(buildBody(form));
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="tpl-name"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Name (1-100)
          </label>
          <input
            id="tpl-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={100}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            disabled={pending}
          />
        </div>
        <div>
          <label
            htmlFor="tpl-description"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Description (optional)
          </label>
          <input
            id="tpl-description"
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            disabled={pending}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="tpl-model"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Model
            </label>
            <select
              id="tpl-model"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={pending}
            >
              {models.length === 0 && (
                <option value={form.model}>{form.model || '(loading…)'}</option>
              )}
              {renderModelOptions(models, form.model)}
            </select>
          </div>
          <div>
            <label
              htmlFor="tpl-reasoning"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Reasoning effort
            </label>
            <select
              id="tpl-reasoning"
              value={form.reasoningEffort ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  reasoningEffort:
                    e.target.value === ''
                      ? null
                      : (e.target.value as Exclude<ReasoningEffort, null>),
                })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={pending}
            >
              {REASONING_OPTIONS.map((opt) => (
                <option
                  key={opt.label}
                  value={opt.value === null ? '' : opt.value}
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="tpl-max-tokens"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Max tokens (1-8000)
            </label>
            <input
              id="tpl-max-tokens"
              type="number"
              min={1}
              max={8000}
              value={form.maxTokens}
              onChange={(e) => setForm({ ...form, maxTokens: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={pending}
            />
          </div>
          <div>
            <label
              htmlFor="tpl-temperature"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Temperature (0-2, step 0.1)
            </label>
            <input
              id="tpl-temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) =>
                setForm({ ...form, temperature: e.target.value })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={pending}
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="tpl-prompt"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Prompt template
          </label>
          <textarea
            id="tpl-prompt"
            value={form.promptText}
            onChange={(e) => setForm({ ...form, promptText: e.target.value })}
            rows={8}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500"
            disabled={pending}
            placeholder={'{{title}}\n{{original}}\n{{hasImage}}'}
          />
          <p className="mt-1 text-[10px] text-slate-500">
            Use <code className="font-mono">{'{{title}}'}</code>,{' '}
            <code className="font-mono">{'{{original}}'}</code>, and{' '}
            <code className="font-mono">{'{{hasImage}}'}</code> as placeholders.
          </p>
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
            {pending ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TemplateRow({
  template,
  isDefault,
  inUseByKeywords,
  onEdit,
  onDelete,
  deleting,
}: {
  template: PromptTemplate;
  isDefault: boolean;
  inUseByKeywords: number;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}): React.ReactElement {
  const disableDelete = isDefault || inUseByKeywords > 0;
  const reason = isDefault
    ? 'set as default in LlmConfig'
    : inUseByKeywords > 0
      ? `bound to ${inUseByKeywords} keyword${inUseByKeywords === 1 ? '' : 's'}`
      : null;
  return (
    <tr className="border-b border-slate-800/60 last:border-0">
      <td className="py-2 pr-3 align-top">
        <div className="font-medium text-slate-100">{template.name}</div>
        {template.description && (
          <div className="text-xs text-slate-500">{template.description}</div>
        )}
      </td>
      <td className="py-2 pr-3 font-mono text-xs text-slate-300 align-top">
        {template.model}
      </td>
      <td className="py-2 pr-3 text-xs text-slate-400 align-top">
        {template.maxTokens}
      </td>
      <td className="py-2 pr-3 text-xs text-slate-400 align-top">
        {template.temperature}
      </td>
      <td className="py-2 pr-3 text-xs text-slate-400 align-top">
        {template.reasoningEffort ?? '—'}
      </td>
      <td className="py-2 pr-3 text-right align-top">
        <div className="inline-flex flex-col items-end gap-1">
          <div className="inline-flex gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={onDelete}
              disabled={disableDelete || deleting}
              title={reason ?? undefined}
            >
              Delete
            </Button>
          </div>
          {reason && (
            <span className="text-[10px] text-amber-400/80">{reason}</span>
          )}
        </div>
      </td>
    </tr>
  );
}

export function PromptTemplates(): React.ReactElement {
  const { data, isLoading, error } = useTemplates();
  const { data: cfg } = useLlmConfig();
  const { data: keywords } = useKeywords();
  const { data: models } = useLlmModels();
  const createMut = useCreateTemplate();
  const updateMut = useUpdateTemplate();
  const deleteMut = useDeleteTemplate();

  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const templates = data ?? [];
  const defaultTemplateId = cfg?.defaultTemplateId ?? null;
  const editInitial = useMemo(
    () => (editing ? formFromTemplate(editing) : EMPTY_FORM),
    [editing],
  );

  const usageByTemplate = useMemo(() => {
    const map = new Map<string, number>();
    for (const kw of keywords ?? []) {
      if (kw.templateId) {
        map.set(kw.templateId, (map.get(kw.templateId) ?? 0) + 1);
      }
    }
    return map;
  }, [keywords]);

  function handleCloseCreate() {
    if (createMut.isPending) return;
    setShowCreate(false);
    setErrorMsg(null);
    createMut.reset();
  }
  function handleCloseEdit() {
    if (updateMut.isPending) return;
    setEditing(null);
    setErrorMsg(null);
    updateMut.reset();
  }

  function handleCreateSubmit(body: CreatePromptTemplateBody) {
    createMut.mutate(body, {
      onSuccess: () => {
        setShowCreate(false);
        setErrorMsg(null);
      },
      onError: (err) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      },
    });
  }
  function handleEditSubmit(body: UpdatePromptTemplateBody) {
    if (!editing) return;
    updateMut.mutate(
      { id: editing.id, patch: body },
      {
        onSuccess: () => {
          setEditing(null);
          setErrorMsg(null);
        },
        onError: (err) => {
          setErrorMsg(err instanceof Error ? err.message : String(err));
        },
      },
    );
  }

  function handleDelete(t: PromptTemplate) {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete template "${t.name}"?`);
      if (!ok) return;
    }
    deleteMut.mutate(t.id, {
      onError: (err) => {
        if (typeof window !== 'undefined') {
          window.alert(
            `Failed to delete template: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      },
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">
          Prompt templates ({templates.length})
        </h2>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          + New template
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">Cargando...</div>
      ) : error ? (
        <div className="text-sm text-red-400">
          Failed to load templates: {String(error)}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-sm text-slate-500">
          No templates yet. Create one to start publishing with the LLM.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-700">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">Max tokens</th>
                <th className="py-2 pr-3">Temperature</th>
                <th className="py-2 pr-3">Reasoning</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  isDefault={t.id === defaultTemplateId}
                  inUseByKeywords={usageByTemplate.get(t.id) ?? 0}
                  onEdit={() => {
                    setEditing(t);
                    setErrorMsg(null);
                  }}
                  onDelete={() => handleDelete(t)}
                  deleting={deleteMut.isPending && deleteMut.variables === t.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TemplateFormModal
        key="create-template"
        isOpen={showCreate}
        onClose={handleCloseCreate}
        initial={EMPTY_FORM}
        title="New prompt template"
        submitLabel="Create"
        onSubmit={handleCreateSubmit}
        pending={createMut.isPending}
        errorMessage={errorMsg}
        models={models ?? []}
      />

      <TemplateFormModal
        key={editing ? `edit-${editing.id}` : 'edit-template-closed'}
        isOpen={editing !== null}
        onClose={handleCloseEdit}
        initial={editInitial}
        title="Edit prompt template"
        submitLabel="Save"
        onSubmit={handleEditSubmit}
        pending={updateMut.isPending}
        errorMessage={errorMsg}
        models={models ?? []}
      />
    </Card>
  );
}
