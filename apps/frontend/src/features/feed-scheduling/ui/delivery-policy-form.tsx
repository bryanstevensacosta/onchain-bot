import { useEffect, useState } from 'react';
import { Button, Card } from '@/shared/ui';
import {
  useDeliveryPolicy,
  useUpdateDeliveryPolicy,
} from '@/features/feed-scheduling/model/use-delivery-policy';
import type { DeliveryPolicyTarget } from '@/features/feed-scheduling/api/delivery-policy-api';

interface DraftState {
  delayMinMs: string;
  delayMaxMs: string;
  dailyCap: string;
  resetHour: string;
}

function draftFromPolicy(policy: {
  delayMinMs: number;
  delayMaxMs: number;
  dailyCap: number;
  resetHour: number;
}): DraftState {
  return {
    delayMinMs: String(policy.delayMinMs),
    delayMaxMs: String(policy.delayMaxMs),
    dailyCap: String(policy.dailyCap),
    resetHour: String(policy.resetHour),
  };
}

function isNonNegativeInt(raw: string): boolean {
  return raw !== '' && Number.isInteger(Number(raw)) && Number(raw) >= 0;
}

export function DeliveryPolicyForm({
  target,
}: {
  target: DeliveryPolicyTarget;
}): React.ReactElement {
  const { data: policy, isLoading, error } = useDeliveryPolicy(target);
  const updateMut = useUpdateDeliveryPolicy(target);

  const [draft, setDraft] = useState<DraftState | null>(null);

  // Re-seed the draft whenever the server-side policy moves. We don't
  // want to clobber a user mid-edit, so this only fires when a value
  // actually changes upstream (same pattern as the rotation form).
  useEffect(() => {
    if (!policy) return;
    setDraft((prev) => {
      if (
        prev &&
        prev.delayMinMs === String(policy.delayMinMs) &&
        prev.delayMaxMs === String(policy.delayMaxMs) &&
        prev.dailyCap === String(policy.dailyCap) &&
        prev.resetHour === String(policy.resetHour)
      ) {
        return prev;
      }
      return draftFromPolicy(policy);
    });
  }, [policy]);

  if (isLoading) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Delivery policy ({target})
        </h2>
        <div className="text-sm text-slate-500">Cargando...</div>
      </Card>
    );
  }
  if (error || !policy) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Delivery policy ({target})
        </h2>
        <div className="text-sm text-red-400">
          Failed to load delivery policy ({target}):{' '}
          {String(error ?? 'no data')}
        </div>
      </Card>
    );
  }

  const current = draft ?? draftFromPolicy(policy);
  const canSubmit =
    !updateMut.isPending &&
    isNonNegativeInt(current.delayMinMs) &&
    isNonNegativeInt(current.delayMaxMs) &&
    Number(current.delayMinMs) <= Number(current.delayMaxMs) &&
    isNonNegativeInt(current.dailyCap) &&
    current.resetHour !== '' &&
    Number.isInteger(Number(current.resetHour)) &&
    Number(current.resetHour) >= 0 &&
    Number(current.resetHour) <= 23;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    updateMut.mutate({
      delayMinMs: Number(current.delayMinMs),
      delayMaxMs: Number(current.delayMaxMs),
      dailyCap: Number(current.dailyCap),
      resetHour: Number(current.resetHour),
    });
  }

  const inputClass =
    'w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500';

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-100 mb-4">
        Delivery policy ({target})
      </h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor={`delivery-${target}-min-ms`}
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Delay min (ms, min 0)
            </label>
            <input
              id={`delivery-${target}-min-ms`}
              type="number"
              min={0}
              value={current.delayMinMs}
              onChange={(e) =>
                setDraft({ ...current, delayMinMs: e.target.value })
              }
              className={inputClass}
              disabled={updateMut.isPending}
            />
          </div>
          <div>
            <label
              htmlFor={`delivery-${target}-max-ms`}
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Delay max (ms, min 0)
            </label>
            <input
              id={`delivery-${target}-max-ms`}
              type="number"
              min={0}
              value={current.delayMaxMs}
              onChange={(e) =>
                setDraft({ ...current, delayMaxMs: e.target.value })
              }
              className={inputClass}
              disabled={updateMut.isPending}
            />
          </div>
          <div>
            <label
              htmlFor={`delivery-${target}-daily-cap`}
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Daily cap (0 = paused)
            </label>
            <input
              id={`delivery-${target}-daily-cap`}
              type="number"
              min={0}
              value={current.dailyCap}
              onChange={(e) =>
                setDraft({ ...current, dailyCap: e.target.value })
              }
              className={inputClass}
              disabled={updateMut.isPending}
            />
          </div>
          <div>
            <label
              htmlFor={`delivery-${target}-reset-hour`}
              className="block text-xs uppercase text-slate-500 mb-1"
            >
              Reset hour UTC (0-23)
            </label>
            <input
              id={`delivery-${target}-reset-hour`}
              type="number"
              min={0}
              max={23}
              value={current.resetHour}
              onChange={(e) =>
                setDraft({ ...current, resetHour: e.target.value })
              }
              className={inputClass}
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

/**
 * Both per-target policies side by side. Rendered BESIDE (not
 * instead of) the frozen `SchedulingRotationConfigForm` until cutover
 * — dual-serve, no deletion.
 */
export function DeliveryPolicySection(): React.ReactElement {
  return (
    <div className="space-y-4">
      <DeliveryPolicyForm target="telegram" />
      <DeliveryPolicyForm target="threads" />
    </div>
  );
}
