import { useEffect, useState } from 'react';
import { Button, Card } from '@/shared/ui';
import {
  useRotationConfig,
  useUpdateRotationConfig,
} from '@/features/crypto-news-ads/model/use-ads';

interface DraftState {
  enabled: boolean;
  everyNPosts: string;
  minMinutesBetweenAds: string;
}

function draftFromConfig(cfg: {
  enabled: boolean;
  everyNPosts: number;
  minMinutesBetweenAds: number;
}): DraftState {
  return {
    enabled: cfg.enabled,
    everyNPosts: String(cfg.everyNPosts),
    minMinutesBetweenAds: String(cfg.minMinutesBetweenAds),
  };
}

export function AdsRotationConfigForm(): React.ReactElement {
  const { data: cfg, isLoading, error } = useRotationConfig();
  const updateMut = useUpdateRotationConfig();

  const [draft, setDraft] = useState<DraftState | null>(null);

  // Re-seed the draft whenever the server-side config moves. We don't
  // want to clobber a user mid-edit, so this only fires when a value
  // actually changes upstream.
  useEffect(() => {
    if (!cfg) return;
    setDraft((prev) => {
      if (
        prev &&
        prev.enabled === cfg.enabled &&
        prev.everyNPosts === String(cfg.everyNPosts) &&
        prev.minMinutesBetweenAds === String(cfg.minMinutesBetweenAds)
      ) {
        return prev;
      }
      return draftFromConfig(cfg);
    });
  }, [cfg]);

  if (isLoading) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Ad rotation schedule
        </h2>
        <div className="text-sm text-slate-500">Cargando...</div>
      </Card>
    );
  }
  if (error || !cfg) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Ad rotation schedule
        </h2>
        <div className="text-sm text-red-400">
          Failed to load rotation config: {String(error ?? 'no data')}
        </div>
      </Card>
    );
  }

  const current = draft ?? draftFromConfig(cfg);
  const canSubmit =
    !updateMut.isPending &&
    current.everyNPosts !== '' &&
    Number(current.everyNPosts) >= 1 &&
    current.minMinutesBetweenAds !== '' &&
    Number(current.minMinutesBetweenAds) >= 0;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    updateMut.mutate({
      enabled: current.enabled,
      everyNPosts: Number(current.everyNPosts),
      minMinutesBetweenAds: Number(current.minMinutesBetweenAds),
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-100 mb-4">
        Ad rotation schedule
      </h2>
      <form onSubmit={handleSave} className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            id="rotation-enabled"
            type="checkbox"
            checked={current.enabled}
            onChange={(e) =>
              setDraft({ ...current, enabled: e.target.checked })
            }
            disabled={updateMut.isPending}
          />
          <span>Ads enabled</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="rotation-every-n-posts"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Every N posts (min 1)
            </label>
            <input
              id="rotation-every-n-posts"
              type="number"
              min={1}
              value={current.everyNPosts}
              onChange={(e) =>
                setDraft({ ...current, everyNPosts: e.target.value })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              disabled={updateMut.isPending}
            />
          </div>
          <div>
            <label
              htmlFor="rotation-min-minutes"
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Min minutes between ads (min 0)
            </label>
            <input
              id="rotation-min-minutes"
              type="number"
              min={0}
              value={current.minMinutesBetweenAds}
              onChange={(e) =>
                setDraft({ ...current, minMinutesBetweenAds: e.target.value })
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
