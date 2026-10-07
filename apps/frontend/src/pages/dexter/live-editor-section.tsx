import { useEffect, useRef, useState } from 'react';
import {
  isPreviewUnresolved,
  previewDexterTemplate,
  useCreateTemplate,
  useDexterTemplates,
  usePreviewTemplate,
  useUpdateTemplate,
  type MessageTemplateView,
} from '@/entities/dexter';
import type {
  PreviewTemplateOutput,
  ResolvedTokenSnapshot,
} from '@/entities/dexter';
import { Badge, Button, Card } from '@/shared/ui';
import { RenderMarkdownV2 } from '@/shared/lib/render-markdown-v2';
import {
  DEXTER_COMMANDS,
  englishMutationError,
  formatStaleAge,
} from './dexter-template-helpers';

/** Keystroke idle time before re-rendering from the frozen snapshot. */
export const LIVE_EDITOR_DEBOUNCE_MS = 400;

const DEFAULT_DRAFT = '*{{symbol}}* | {{name}} — {{chain}}\n`{{address}}`';

interface FrozenSnapshot {
  readonly token: ResolvedTokenSnapshot;
  readonly address: string;
  readonly command: string;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Live template editor (separate from `PreviewSection` by design: that
 * section owns the one-shot active/id/draft modes + seed wiring, while
 * this one owns the snapshot lifecycle — resolve once, re-render on
 * every keystroke without re-resolving).
 *
 * Flow: `Load data` resolves `{ draft, address }` ONCE via
 * `usePreviewTemplate` and freezes the returned `token`. Typing then
 * re-sends `{ draft, token }` WITHOUT `address` (debounced 400 ms, the
 * in-flight request aborted, stale responses discarded by sequence id).
 * The backend is the only render truth — the browser never substitutes
 * placeholders.
 *
 * Save reuses the shared CRUD mutations (`useCreateTemplate` /
 * `useUpdateTemplate` — the same hooks `TemplateFormModal` uses, no
 * second implementation): a linked template whose name is unchanged
 * PATCHes the body back (version++); a free draft — or a renamed link —
 * POSTs as a new template. Backend owns all validation (409/400 surface
 * via `englishMutationError`); there is no autosave, only the button.
 */
export function LiveEditorSection() {
  const [command, setCommand] = useState<string>('ca');
  const [bodyText, setBodyText] = useState(DEFAULT_DRAFT);
  const [addressInput, setAddressInput] = useState('');
  const [snapshot, setSnapshot] = useState<FrozenSnapshot | null>(null);
  const [liveResult, setLiveResult] = useState<
    PreviewTemplateOutput | undefined
  >(undefined);
  const [liveErrorText, setLiveErrorText] = useState<string | null>(null);
  const [livePending, setLivePending] = useState(false);

  const resolve = usePreviewTemplate();

  // Same CRUD mutations as TemplateFormModal — no second implementation.
  const templateList = useDexterTemplates(command);
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const templateRows: ReadonlyArray<MessageTemplateView> = Array.isArray(
    templateList.data,
  )
    ? templateList.data
    : [];
  const linked: MessageTemplateView | null =
    linkedId !== null
      ? (templateRows.find((t) => t.id === linkedId) ?? null)
      : null;

  const pickTemplate = (id: string) => {
    createTemplate.reset();
    updateTemplate.reset();
    if (id === '') {
      setLinkedId(null);
      return;
    }
    const target = templateRows.find((t) => t.id === id);
    if (!target) return;
    setLinkedId(target.id);
    setCommand(target.command);
    setBodyText(target.bodyMarkdown);
    setSaveName(target.name);
  };

  const detach = () => {
    createTemplate.reset();
    updateTemplate.reset();
    setLinkedId(null);
  };

  // Linked + name unchanged → PATCH body; otherwise POST as new.
  const isSaveBack =
    linked !== null &&
    saveName.trim() !== '' &&
    saveName.trim() === linked.name;
  const savePending = createTemplate.isPending || updateTemplate.isPending;
  const save = () => {
    if (savePending || bodyText.trim() === '') return;
    if (isSaveBack && linked !== null) {
      updateTemplate.mutate({
        id: linked.id,
        body: { bodyMarkdown: bodyText },
      });
    } else {
      if (saveName.trim() === '') return;
      createTemplate.mutate(
        { command, name: saveName.trim(), bodyMarkdown: bodyText },
        {
          onSuccess: (created) => {
            setLinkedId(created.id);
            setSaveName(created.name);
          },
        },
      );
    }
  };
  const saveErrorText = createTemplate.isError
    ? englishMutationError(createTemplate.error)
    : updateTemplate.isError
      ? englishMutationError(updateTemplate.error)
      : null;
  const saveDisabled =
    savePending ||
    bodyText.trim() === '' ||
    (!isSaveBack && saveName.trim() === '');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  const cancelInFlight = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  };

  // Teardown only: cancel the debounce + abort any in-flight re-render.
  useEffect(() => cancelInFlight, []);

  const trimmedAddress = addressInput.trim();
  const snapshotStale =
    snapshot !== null &&
    (trimmedAddress !== snapshot.address || command !== snapshot.command);

  // Re-render from the frozen snapshot on every keystroke (debounced).
  useEffect(() => {
    if (snapshot === null || snapshotStale) {
      setLivePending(false);
      return;
    }
    setLivePending(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = seqRef.current + 1;
      seqRef.current = seq;
      const frozen = snapshot;
      void previewDexterTemplate(
        {
          draft: { command: frozen.command, bodyMarkdown: bodyText },
          token: frozen.token,
        },
        controller.signal,
      ).then(
        (output) => {
          if (seqRef.current !== seq) return;
          abortRef.current = null;
          setLivePending(false);
          setLiveErrorText(null);
          setLiveResult(output);
        },
        (err: unknown) => {
          if (seqRef.current !== seq || isAbortError(err)) return;
          abortRef.current = null;
          setLivePending(false);
          setLiveErrorText(englishMutationError(err));
        },
      );
    }, LIVE_EDITOR_DEBOUNCE_MS);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [bodyText, snapshot, snapshotStale]);

  const load = () => {
    if (trimmedAddress === '' || resolve.isPending) return;
    cancelInFlight();
    seqRef.current += 1;
    setSnapshot(null);
    setLiveErrorText(null);
    void resolve
      .mutateAsync({
        draft: { command, bodyMarkdown: bodyText },
        address: trimmedAddress,
      })
      .then(
        (output) => {
          setLiveResult(output);
          if (!isPreviewUnresolved(output) && output.token !== undefined) {
            setSnapshot({
              token: output.token,
              address: trimmedAddress,
              command,
            });
          }
        },
        () => {
          setLiveResult(undefined);
        },
      );
  };

  const errorText = resolve.isError
    ? englishMutationError(resolve.error)
    : liveErrorText;
  const unresolved =
    liveResult !== undefined && isPreviewUnresolved(liveResult);

  return (
    <Card>
      <div data-testid="dexter-live-section">
        <h2 className="text-sm font-bold text-slate-100">Live editor</h2>
        <p className="text-xs text-slate-500 mt-1">
          Load token data once, then type — the preview re-renders from the
          frozen snapshot without re-resolving. Pick a template to edit it here,
          or save the draft as a new template.
        </p>

        <div className="grid gap-2 mt-2">
          <label className="block text-xs text-slate-400">
            Command
            <select
              data-testid="dexter-live-command"
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            >
              {DEXTER_COMMANDS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-400">
            Address
            <input
              data-testid="dexter-live-address"
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
              placeholder="Solana or EVM address"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
            />
          </label>
          <div>
            <Button
              size="sm"
              data-testid="dexter-live-load"
              disabled={trimmedAddress === '' || resolve.isPending}
              onClick={load}
            >
              {resolve.isPending ? 'Loading…' : 'Load data'}
            </Button>
          </div>
        </div>

        {snapshotStale && (
          <div
            data-testid="dexter-live-stale"
            className="text-xs text-amber-300 mt-2"
          >
            Inputs changed — press Load data for a fresh snapshot.
          </div>
        )}

        {errorText !== null && (
          <div
            data-testid="dexter-live-error"
            className="text-xs text-red-400 mt-2"
          >
            {errorText}
          </div>
        )}

        <label className="block text-xs text-slate-400 mt-2">
          Draft (Markdown with {'{{placeholders}}'})
          <textarea
            data-testid="dexter-live-editor"
            className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
            rows={5}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
        </label>

        <div className="mt-2 space-y-2 border-t border-slate-800 pt-2">
          <label className="block text-xs text-slate-400">
            Template
            <select
              data-testid="dexter-live-template-picker"
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-100"
              value={linked?.id ?? ''}
              onChange={(e) => pickTemplate(e.target.value)}
            >
              <option value="">Free draft</option>
              {templateRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isActive ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </label>
          {linked !== null && (
            <div
              data-testid="dexter-live-editing"
              className="flex flex-wrap items-center gap-2 text-xs text-slate-300"
            >
              <span>Editing {linked.name}</span>
              <Button
                size="sm"
                variant="secondary"
                data-testid="dexter-live-detach"
                onClick={detach}
              >
                Detach
              </Button>
            </div>
          )}
          <label className="block text-xs text-slate-400">
            Name (for save as new)
            <input
              data-testid="dexter-live-save-name"
              className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-100"
              placeholder="new-template-name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              disabled={savePending}
            />
          </label>
          <div>
            <Button
              size="sm"
              data-testid="dexter-live-save"
              disabled={saveDisabled}
              onClick={save}
            >
              {savePending ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {saveErrorText !== null && (
            <div
              data-testid="dexter-live-save-error"
              className="text-xs text-red-400"
            >
              {saveErrorText}
            </div>
          )}
        </div>

        {livePending && (
          <div
            data-testid="dexter-live-loading"
            className="text-xs text-slate-500 mt-2"
          >
            Rendering…
          </div>
        )}

        {liveResult !== undefined && !unresolved && (
          <div data-testid="dexter-live-result" className="mt-2 space-y-2">
            <div className="bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200">
              <RenderMarkdownV2 body={liveResult.text} />
            </div>
            <div
              data-testid="dexter-live-placeholders"
              className="flex flex-wrap items-center gap-2"
            >
              {liveResult.token?.stale === true && (
                <span data-testid="dexter-live-stale-data">
                  <Badge tone="yellow">
                    {`Stale data from ${formatStaleAge(liveResult.token.staleAgeMs, liveResult.token.staleAsOf)}`}
                  </Badge>
                </span>
              )}
              {liveResult.truncated && (
                <span data-testid="dexter-live-truncated">
                  <Badge tone="yellow">truncated</Badge>
                </span>
              )}
              {liveResult.placeholdersUsed.map((key) => (
                <Badge key={key} tone="blue">
                  {key}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {liveResult !== undefined && unresolved && (
          <div
            data-testid="dexter-live-unresolved"
            className="text-xs text-amber-300 mt-2 space-y-1"
          >
            <div>
              {liveResult.pending === true
                ? `Token data pending for ${liveResult.address} — retry shortly`
                : `No resolution for ${liveResult.address}: ${liveResult.error}`}
            </div>
            {(liveResult.candidates ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(liveResult.candidates ?? []).map((c) => (
                  <Badge key={c} tone="amber">
                    {c}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
