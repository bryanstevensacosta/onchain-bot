import { useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/shared/ui';
import { SchedulingHtmlPreview } from '@/features/feed-scheduling';
import { markdownToTelegramHtml } from '@/features/prompt-playground/lib/markdown-to-telegram-html';
import { HttpError } from '@/shared/api/http-client';
import { useFeedMessages } from '@/entities/feed';
import {
  useCreateTemplate,
  useLlmModels,
  usePreviewMutation,
  useTemplates,
  useUpdateTemplate,
} from '@/features/prompt-playground/model/use-playground';
import type {
  CreatePromptTemplateBody,
  LlmModel,
  PromptTemplate,
  ReasoningEffort,
  UpdatePromptTemplateBody,
} from '@/features/feed-publisher/api/llm-config-api';

interface DraftState {
  templateId: string;
  systemPromptText: string;
  promptText: string;
  model: string;
  supportsVision: boolean;
  maxTokens: string;
  temperature: string;
  reasoningEffort: ReasoningEffort;
}

const REASONING_OPTIONS: ReadonlyArray<{
  value: ReasoningEffort;
  label: string;
}> = [
  { value: null, label: '(none)' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
  { value: 'max', label: 'max' },
];

const EMPTY_DRAFT: DraftState = {
  templateId: '',
  systemPromptText: '',
  promptText: '',
  model: '',
  supportsVision: true,
  maxTokens: '2000',
  temperature: '0.7',
  reasoningEffort: null,
};

function draftFromTemplate(t: PromptTemplate): DraftState {
  return {
    templateId: t.id,
    systemPromptText: t.systemPromptText ?? '',
    promptText: t.promptText,
    model: t.model,
    supportsVision: t.supportsVision ?? true,
    maxTokens: String(t.maxTokens),
    temperature: String(t.temperature),
    reasoningEffort: t.reasoningEffort,
  };
}

function isDraftRunnable(draft: DraftState, rawContent: string): boolean {
  return (
    draft.promptText.trim().length > 0 &&
    draft.model.trim().length > 0 &&
    rawContent.trim().length > 0
  );
}

function isUpdatable(draft: DraftState): boolean {
  if (draft.model.trim().length === 0 || draft.model.length > 200) return false;
  if (draft.promptText.trim().length === 0) return false;
  const maxTokens = Number(draft.maxTokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8000) {
    return false;
  }
  const temperature = Number(draft.temperature);
  if (Number.isNaN(temperature) || temperature < 0 || temperature > 2) {
    return false;
  }
  return true;
}

function isSavable(name: string, draft: DraftState): boolean {
  if (name.trim().length === 0 || name.length > 100) return false;
  if (draft.model.trim().length === 0 || draft.model.length > 200) return false;
  if (draft.promptText.trim().length === 0) return false;
  const maxTokens = Number(draft.maxTokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8000) {
    return false;
  }
  const temperature = Number(draft.temperature);
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

function isPreviewMissing(err: unknown): boolean {
  return err instanceof HttpError && err.status === 404;
}

const PLACEHOLDERS = ['{{title}}', '{{original}}', '{{hasImage}}'] as const;

const inputCls =
  'bg-slate-800 text-slate-100 text-sm rounded px-3 py-1.5 border border-slate-700 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50';
const labelCls = 'block text-xs uppercase text-slate-500 mb-1';

export function PlaygroundForm(): React.ReactElement {
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const { data: models } = useLlmModels();
  const samples = useFeedMessages(50, undefined, 'crypto-news');
  const previewMut = usePreviewMutation();
  const createMut = useCreateTemplate();
  const updateMut = useUpdateTemplate();

  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [sampleId, setSampleId] = useState<string>('');
  const [rawTitle, setRawTitle] = useState<string>('');
  const [rawContent, setRawContent] = useState<string>('');
  const [hasImage, setHasImage] = useState<boolean>(false);
  const [generate, setGenerate] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>('');
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [outputView, setOutputView] = useState<'raw' | 'rendered'>('raw');
  const userPromptRef = useRef<HTMLTextAreaElement>(null);

  const templateList = useMemo(() => templates ?? [], [templates]);
  const sampleList = useMemo(() => samples.data ?? [], [samples.data]);
  const loadedTemplate = useMemo(
    () => templateList.find((t) => t.id === draft.templateId) ?? null,
    [templateList, draft.templateId],
  );
  const loadedTemplateName = loadedTemplate?.name ?? '';
  const isSeedTemplate =
    loadedTemplateName === 'Default' ||
    loadedTemplateName === 'Default (imported)';

  function handleTemplateChange(templateId: string) {
    const tpl = templateList.find((t) => t.id === templateId);
    setDraft(tpl ? draftFromTemplate(tpl) : { ...EMPTY_DRAFT, templateId: '' });
    setSaveOk(null);
  }

  function handleSampleChange(id: string) {
    setSampleId(id);
    const msg = sampleList.find((m) => m.id === id);
    if (msg) {
      setRawTitle(msg.title ?? '');
      setRawContent(msg.content);
      setHasImage(msg.media.length > 0);
    }
    previewMut.reset();
  }

  function insertPlaceholder(token: (typeof PLACEHOLDERS)[number]) {
    const el = userPromptRef.current;
    if (!el) {
      setDraft((d) => ({ ...d, promptText: `${d.promptText}${token}` }));
      return;
    }
    const start = el.selectionStart ?? draft.promptText.length;
    const end = el.selectionEnd ?? draft.promptText.length;
    const next = `${draft.promptText.slice(0, start)}${token}${draft.promptText.slice(end)}`;
    setDraft({ ...draft, promptText: next });
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  }

  function handleRun() {
    if (!isDraftRunnable(draft, rawContent) || previewMut.isPending) return;
    setSaveOk(null);
    previewMut.mutate({
      // Draft-only: it already mirrors the loaded template (if any), so the
      // backend XOR (templateId ^ draft) is always satisfied and edits are
      // never silently ignored in favor of the saved row.
      draft: {
        systemPromptText: draft.systemPromptText,
        promptText: draft.promptText,
        model: draft.model,
        maxTokens: Number(draft.maxTokens),
        temperature: Number(draft.temperature),
        reasoningEffort: draft.reasoningEffort,
        supportsVision: draft.supportsVision,
      },
      rawTitle: rawTitle.trim() ? rawTitle.trim() : undefined,
      rawContent,
      hasImage,
      generate,
    });
  }

  function handleUpdate() {
    if (!draft.templateId || !isUpdatable(draft) || updateMut.isPending) return;
    const patch: UpdatePromptTemplateBody = {
      model: draft.model,
      supportsVision: draft.supportsVision,
      maxTokens: Number(draft.maxTokens),
      temperature: Number(draft.temperature),
      reasoningEffort: draft.reasoningEffort,
      promptText: draft.promptText,
      systemPromptText: draft.systemPromptText,
    };
    updateMut.mutate(
      { id: draft.templateId, patch },
      {
        onSuccess: () => {
          setSaveOk(`Plantilla «${loadedTemplateName}» actualizada`);
        },
      },
    );
  }

  function handleSave() {
    if (!isSavable(saveName, draft) || createMut.isPending) return;
    const body: CreatePromptTemplateBody = {
      name: saveName.trim(),
      description: null,
      model: draft.model,
      supportsVision: draft.supportsVision,
      maxTokens: Number(draft.maxTokens),
      temperature: Number(draft.temperature),
      reasoningEffort: draft.reasoningEffort,
      promptText: draft.promptText,
      systemPromptText: draft.systemPromptText,
    };
    createMut.mutate(body, {
      onSuccess: (saved) => {
        setSaveOk(`Plantilla «${saved.name}» guardada`);
        setSaveName('');
      },
    });
  }

  const result = previewMut.data ?? null;
  const previewMissing = isPreviewMissing(previewMut.error);
  const runDisabled =
    !isDraftRunnable(draft, rawContent) || previewMut.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Borrador del prompt
        </h2>
        <div className="space-y-3">
          <div>
            <label htmlFor="pg-template" className={labelCls}>
              Cargar plantilla (opcional)
            </label>
            {templatesLoading ? (
              <div className="text-sm text-slate-500">Cargando...</div>
            ) : (
              <select
                id="pg-template"
                value={draft.templateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className={`w-full ${inputCls}`}
              >
                <option value="">Borrador libre (sin plantilla)</option>
                {templateList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.model}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="pg-system" className={labelCls}>
              System prompt
            </label>
            <textarea
              id="pg-system"
              value={draft.systemPromptText}
              onChange={(e) =>
                setDraft({ ...draft, systemPromptText: e.target.value })
              }
              rows={3}
              placeholder="Persona, rol, estilo…"
              className={`w-full font-mono ${inputCls}`}
            />
          </div>
          <div>
            <label htmlFor="pg-user" className={labelCls}>
              User prompt (plantilla con placeholders)
            </label>
            <textarea
              id="pg-user"
              ref={userPromptRef}
              value={draft.promptText}
              onChange={(e) =>
                setDraft({ ...draft, promptText: e.target.value })
              }
              rows={8}
              placeholder={'{{title}}\n{{original}}\n{{hasImage}}'}
              className={`w-full font-mono ${inputCls}`}
            />
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
              <span>Insertar en el cursor:</span>
              {PLACEHOLDERS.map((ph) => (
                <button
                  key={ph}
                  type="button"
                  onClick={() => insertPlaceholder(ph)}
                  className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:border-blue-500 hover:text-blue-300"
                >
                  {ph}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pg-model" className={labelCls}>
                Modelo
              </label>
              <select
                id="pg-model"
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                className={`w-full ${inputCls}`}
              >
                <option value="">Selecciona un modelo…</option>
                {renderModelOptions(models ?? [], draft.model)}
              </select>
            </div>
            <div className="flex items-center">
              <input
                id="pg-vision"
                type="checkbox"
                checked={draft.supportsVision}
                onChange={(e) =>
                  setDraft({ ...draft, supportsVision: e.target.checked })
                }
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
              />
              <label
                htmlFor="pg-vision"
                className="ml-2 text-sm text-slate-300"
              >
                Vision (imágenes)
              </label>
            </div>
            <div>
              <label htmlFor="pg-reasoning" className={labelCls}>
                Reasoning effort
              </label>
              <select
                id="pg-reasoning"
                value={draft.reasoningEffort ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reasoningEffort:
                      e.target.value === ''
                        ? null
                        : (e.target.value as Exclude<ReasoningEffort, null>),
                  })
                }
                className={`w-full ${inputCls}`}
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
              <label htmlFor="pg-max-tokens" className={labelCls}>
                Max tokens (1-8000)
              </label>
              <input
                id="pg-max-tokens"
                type="number"
                min={1}
                max={8000}
                value={draft.maxTokens}
                onChange={(e) =>
                  setDraft({ ...draft, maxTokens: e.target.value })
                }
                className={`w-full ${inputCls}`}
              />
            </div>
            <div>
              <label htmlFor="pg-temperature" className={labelCls}>
                Temperature (0-2)
              </label>
              <input
                id="pg-temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                onChange={(e) =>
                  setDraft({ ...draft, temperature: e.target.value })
                }
                className={`w-full ${inputCls}`}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Muestra real
        </h2>
        <div className="space-y-3">
          <div>
            <label htmlFor="pg-sample" className={labelCls}>
              Noticia de muestra
            </label>
            {samples.isLoading ? (
              <div className="text-sm text-slate-500">Cargando...</div>
            ) : samples.error ? (
              <div className="text-sm text-red-400">
                No se pudieron cargar las muestras: {String(samples.error)}
              </div>
            ) : sampleList.length === 0 ? (
              <div className="text-sm text-slate-500">
                Sin mensajes recientes de ingesta.
              </div>
            ) : (
              <select
                id="pg-sample"
                value={sampleId}
                onChange={(e) => handleSampleChange(e.target.value)}
                className={`w-full ${inputCls}`}
              >
                <option value="">Selecciona una muestra…</option>
                {sampleList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {(m.title ?? m.content.slice(0, 60) ?? '—') +
                      (m.media.length > 0 ? ' [img]' : '')}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="pg-raw-title" className={labelCls}>
              Título (editable)
            </label>
            <input
              id="pg-raw-title"
              type="text"
              value={rawTitle}
              onChange={(e) => setRawTitle(e.target.value)}
              placeholder="(opcional)"
              className={`w-full ${inputCls}`}
            />
          </div>
          <div>
            <label htmlFor="pg-raw-content" className={labelCls}>
              Contenido (editable)
            </label>
            <textarea
              id="pg-raw-content"
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              rows={6}
              placeholder="Pega o edita el contenido crudo…"
              className={`w-full ${inputCls}`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center">
              <input
                id="pg-has-image"
                type="checkbox"
                checked={hasImage}
                onChange={(e) => setHasImage(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
              />
              <label
                htmlFor="pg-has-image"
                className="ml-2 text-sm text-slate-300"
              >
                Con imagen
              </label>
            </div>
            <div className="flex items-center">
              <input
                id="pg-generate"
                type="checkbox"
                checked={generate}
                onChange={(e) => setGenerate(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500"
              />
              <label
                htmlFor="pg-generate"
                className="ml-2 text-sm text-slate-300"
              >
                Generar con LLM (1 llamada)
              </label>
            </div>
          </div>
          <div>
            <Button
              variant="primary"
              size="sm"
              disabled={runDisabled}
              onClick={handleRun}
            >
              {previewMut.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Ejecutando...
                </span>
              ) : (
                'Probar prompt'
              )}
            </Button>
          </div>
          {previewMissing && (
            <div
              role="alert"
              className="text-xs text-amber-300 bg-amber-900/20 border border-amber-900/40 rounded px-3 py-2"
            >
              El backend aún no expone /preview (despliega dev)
            </div>
          )}
          {previewMut.error && !previewMissing && (
            <div
              role="alert"
              className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded px-3 py-2"
            >
              {previewMut.error.message}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Resultado</h2>
        {previewMut.isPending ? (
          <div className="text-sm text-slate-500">Cargando...</div>
        ) : !result ? (
          <div className="text-sm text-slate-500">
            Sin resultado — configura el borrador y la muestra, luego pulsa
            «Probar prompt».
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-slate-400">Modelo</div>
              <div className="text-slate-100 font-mono text-xs">
                {result.model}
              </div>
              <div className="text-slate-400">Max tokens</div>
              <div className="text-slate-100">{result.maxTokens}</div>
              <div className="text-slate-400">Temperature</div>
              <div className="text-slate-100">{result.temperature}</div>
              <div className="text-slate-400">Reasoning</div>
              <div className="text-slate-100">
                {result.reasoningEffort ?? '—'}
              </div>
            </div>
            <section>
              <h3 className="text-xs uppercase text-slate-500 mb-2">
                System prompt
              </h3>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans bg-slate-800/50 rounded p-2 max-h-32 overflow-y-auto">
                {result.systemPrompt || '—'}
              </pre>
            </section>
            <section>
              <h3 className="text-xs uppercase text-slate-500 mb-2">
                User prompt renderizado
              </h3>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans bg-slate-800/50 rounded p-2 max-h-40 overflow-y-auto">
                {result.renderedUserPrompt}
              </pre>
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs uppercase text-slate-500">Salida LLM</h3>
                {result.content && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setOutputView('raw')}
                      className={`rounded border px-2 py-0.5 text-[10px] font-mono ${
                        outputView === 'raw'
                          ? 'border-blue-500 text-blue-300'
                          : 'border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Texto
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutputView('rendered')}
                      className={`rounded border px-2 py-0.5 text-[10px] font-mono ${
                        outputView === 'rendered'
                          ? 'border-blue-500 text-blue-300'
                          : 'border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Vista previa
                    </button>
                  </div>
                )}
              </div>
              {result.content ? (
                outputView === 'rendered' ? (
                  <div className="bg-slate-800/50 rounded p-2 max-h-40 overflow-y-auto">
                    <SchedulingHtmlPreview
                      body={markdownToTelegramHtml(result.content)}
                    />
                  </div>
                ) : (
                  <pre className="text-sm text-emerald-300 whitespace-pre-wrap font-sans bg-slate-800/50 rounded p-2 max-h-40 overflow-y-auto">
                    {result.content}
                  </pre>
                )
              ) : (
                <div className="text-sm text-slate-500">
                  — (marca «Generar con LLM» para obtener salida)
                </div>
              )}
            </section>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Guardar</h2>
        <div className="space-y-3">
          {loadedTemplate && (
            <div>
              <div>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!isUpdatable(draft) || updateMut.isPending}
                  onClick={handleUpdate}
                >
                  {updateMut.isPending
                    ? 'Actualizando...'
                    : `Actualizar «${loadedTemplateName}»`}
                </Button>
              </div>
              {isSeedTemplate && (
                <div
                  role="note"
                  className="mt-2 text-xs text-amber-300 bg-amber-900/20 border border-amber-900/40 rounded px-3 py-2"
                >
                  «Default» se reescribe con el seed en cada arranque si quitas
                  el marcador del system prompt. Para cambios permanentes, crea
                  una plantilla nueva.
                </div>
              )}
              {updateMut.error && (
                <div
                  role="alert"
                  className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded px-3 py-2"
                >
                  {updateMut.error.message}
                </div>
              )}
            </div>
          )}
          <div>
            <label htmlFor="pg-save-name" className={labelCls}>
              Nombre (1-100, nunca sobrescribe plantillas existentes)
            </label>
            <input
              id="pg-save-name"
              type="text"
              value={saveName}
              onChange={(e) => {
                setSaveName(e.target.value);
                setSaveOk(null);
              }}
              maxLength={100}
              placeholder="Mi experimento v1…"
              disabled={createMut.isPending}
              className={`w-full ${inputCls}`}
            />
          </div>
          <div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!isSavable(saveName, draft) || createMut.isPending}
              onClick={handleSave}
            >
              {createMut.isPending ? 'Guardando...' : 'Guardar plantilla'}
            </Button>
          </div>
          {saveOk && (
            <div
              role="status"
              className="text-xs text-emerald-300 bg-emerald-900/20 border border-emerald-900/40 rounded px-3 py-2"
            >
              {saveOk}
            </div>
          )}
          {createMut.error && (
            <div
              role="alert"
              className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded px-3 py-2"
            >
              {createMut.error.message}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
