import { useEffect, useState } from 'react';
import { Button, Card } from '@/shared/ui';
import {
  useLlmConfig,
  useLlmModels,
  useTemplates,
  useUpdateLlmConfig,
} from '@/features/crypto-news-publisher/model/use-llm-config';
import type { LlmModel } from '@/features/crypto-news-publisher/api/llm-config-api';

interface DraftState {
  defaultTemplateId: string;
  targetChannel: string;
  enabled: boolean;
  dailyCap: string;
  dailyResetUtcHour: string;
  randomDelayMinMs: string;
  randomDelayMaxMs: string;
  llmMaxAttempts: string;
  // Model is shown for context only — the source of truth lives on
  // PromptTemplate; this is the model of the current default template.
  model: string;
}

function draftFromConfig(
  cfg: {
    defaultTemplateId: string;
    targetChannel: string;
    enabled: boolean;
    dailyCap: number;
    dailyResetUtcHour: number;
    randomDelayMinMs: number;
    randomDelayMaxMs: number;
    llmMaxAttempts: number;
  },
  defaultModelId: string,
): DraftState {
  return {
    defaultTemplateId: cfg.defaultTemplateId,
    targetChannel: cfg.targetChannel,
    enabled: cfg.enabled,
    dailyCap: String(cfg.dailyCap),
    dailyResetUtcHour: String(cfg.dailyResetUtcHour),
    randomDelayMinMs: String(cfg.randomDelayMinMs),
    randomDelayMaxMs: String(cfg.randomDelayMaxMs),
    llmMaxAttempts: String(cfg.llmMaxAttempts),
    model: defaultModelId,
  };
}

function renderModelOptions(
  models: ReadonlyArray<LlmModel>,
  currentId: string,
): React.ReactNode {
  // Group by `ownedBy` when present so the dropdown is scannable.
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
      {currentId && !models.some((m) => m.id === currentId) && (
        <option value={currentId}>{currentId} (not in gateway list)</option>
      )}
    </>
  );
}

export function LlmConfigForm(): React.ReactElement {
  const { data: cfg, isLoading, error } = useLlmConfig();
  const { data: models } = useLlmModels();
  const { data: templates } = useTemplates();
  const updateMut = useUpdateLlmConfig();

  const [draft, setDraft] = useState<DraftState | null>(null);

  // Re-seed the draft whenever the server-side config or the default
  // template's model changes. We don't want to clobber a user
  // mid-edit, so this only fires when the upstream id actually moves.
  useEffect(() => {
    if (!cfg) return;
    const defaultTpl = (templates ?? []).find(
      (t) => t.id === cfg.defaultTemplateId,
    );
    const nextModel = defaultTpl?.model ?? '';
    setDraft((prev) => {
      if (
        prev &&
        prev.defaultTemplateId === cfg.defaultTemplateId &&
        prev.targetChannel === cfg.targetChannel &&
        prev.enabled === cfg.enabled &&
        prev.dailyCap === String(cfg.dailyCap) &&
        prev.dailyResetUtcHour === String(cfg.dailyResetUtcHour) &&
        prev.randomDelayMinMs === String(cfg.randomDelayMinMs) &&
        prev.randomDelayMaxMs === String(cfg.randomDelayMaxMs) &&
        prev.llmMaxAttempts === String(cfg.llmMaxAttempts)
      ) {
        return prev;
      }
      return draftFromConfig(cfg, nextModel);
    });
  }, [cfg, templates]);

  if (isLoading) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Default LLM settings
        </h2>
        <div className="text-sm text-slate-500">Cargando...</div>
      </Card>
    );
  }
  if (error || !cfg) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Default LLM settings
        </h2>
        <div className="text-sm text-red-400">
          Failed to load LLM config: {String(error ?? 'no data')}
        </div>
      </Card>
    );
  }

  const current = draft ?? draftFromConfig(cfg, '');
  const tplOptions = templates ?? [];
  const modelOptions = models ?? [];
  const canSubmit =
    !updateMut.isPending &&
    current.dailyCap !== '' &&
    current.dailyResetUtcHour !== '' &&
    current.randomDelayMinMs !== '' &&
    current.randomDelayMaxMs !== '' &&
    current.llmMaxAttempts !== '' &&
    current.defaultTemplateId !== '';

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    updateMut.mutate({
      defaultTemplateId: current.defaultTemplateId,
      targetChannel: current.targetChannel,
      enabled: current.enabled,
      dailyCap: Number(current.dailyCap),
      dailyResetUtcHour: Number(current.dailyResetUtcHour),
      randomDelayMinMs: Number(current.randomDelayMinMs),
      randomDelayMaxMs: Number(current.randomDelayMaxMs),
      llmMaxAttempts: Number(current.llmMaxAttempts),
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-100 mb-4">
        Default LLM settings
      </h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label
            htmlFor="llm-default-template"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Default template
          </label>
          <select
            id="llm-default-template"
            value={current.defaultTemplateId}
            onChange={(e) =>
              setDraft({ ...current, defaultTemplateId: e.target.value })
            }
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            disabled={updateMut.isPending || tplOptions.length === 0}
          >
            {tplOptions.length === 0 && (
              <option value={current.defaultTemplateId}>
                (no templates — create one first)
              </option>
            )}
            {tplOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-slate-500">
            Used when a matched keyword has no template override.
          </p>
        </div>

        <div>
          <label
            htmlFor="llm-model"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Model of default template
          </label>
          <select
            id="llm-model"
            value={current.model}
            onChange={(e) => setDraft({ ...current, model: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            disabled
          >
            {renderModelOptions(modelOptions, current.model)}
          </select>
          <p className="mt-1 text-[10px] text-slate-500">
            Edit the model on the template itself — it lives with the other LLM
            knobs, not here.
          </p>
        </div>

        <div>
          <label
            htmlFor="llm-target-channel"
            className="block text-xs uppercase text-slate-500 mb-1"
          >
            Target Telegram channel
          </label>
          <input
            id="llm-target-channel"
            type="text"
            value={current.targetChannel}
            onChange={(e) =>
              setDraft({ ...current, targetChannel: e.target.value })
            }
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            disabled={updateMut.isPending}
            placeholder="@your_vip_channel or channel id"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            id="llm-enabled"
            type="checkbox"
            checked={current.enabled}
            onChange={(e) =>
              setDraft({ ...current, enabled: e.target.checked })
            }
            disabled={updateMut.isPending}
          />
          <span>Publisher enabled</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="llm-daily-cap"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Daily cap (1-200)
            </label>
            <input
              id="llm-daily-cap"
              type="number"
              min={1}
              max={200}
              value={current.dailyCap}
              onChange={(e) =>
                setDraft({ ...current, dailyCap: e.target.value })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={updateMut.isPending}
            />
          </div>
          <div>
            <label
              htmlFor="llm-daily-reset"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Daily reset UTC hour (0-23)
            </label>
            <input
              id="llm-daily-reset"
              type="number"
              min={0}
              max={23}
              value={current.dailyResetUtcHour}
              onChange={(e) =>
                setDraft({ ...current, dailyResetUtcHour: e.target.value })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={updateMut.isPending}
            />
          </div>
          <div>
            <label
              htmlFor="llm-delay-min"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Random delay min (ms)
            </label>
            <input
              id="llm-delay-min"
              type="number"
              min={0}
              value={current.randomDelayMinMs}
              onChange={(e) =>
                setDraft({ ...current, randomDelayMinMs: e.target.value })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={updateMut.isPending}
            />
          </div>
          <div>
            <label
              htmlFor="llm-delay-max"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Random delay max (ms)
            </label>
            <input
              id="llm-delay-max"
              type="number"
              min={1}
              value={current.randomDelayMaxMs}
              onChange={(e) =>
                setDraft({ ...current, randomDelayMaxMs: e.target.value })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={updateMut.isPending}
            />
          </div>
          <div className="col-span-2">
            <label
              htmlFor="llm-max-attempts"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              LLM max attempts (1-10)
            </label>
            <input
              id="llm-max-attempts"
              type="number"
              min={1}
              max={10}
              value={current.llmMaxAttempts}
              onChange={(e) =>
                setDraft({ ...current, llmMaxAttempts: e.target.value })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={updateMut.isPending}
            />
          </div>
        </div>

        {updateMut.error && (
          <div
            role="alert"
            className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded px-3 py-2"
          >
            Failed to save: {String(updateMut.error)}
          </div>
        )}
        {updateMut.isSuccess && !updateMut.isPending && (
          <div
            role="status"
            className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-900/40 rounded px-3 py-2"
          >
            Saved.
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
          >
            {updateMut.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
