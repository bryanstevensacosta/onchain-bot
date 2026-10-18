import { HttpError, httpGet, httpPatch } from '@/shared/api/http-client';
import { schedulingPath } from '@/shared/api/scheduling-base';
import {
  fetchRotationConfig,
  type RotationConfigView,
} from '@/features/feed-scheduling/api/scheduling-api';

/**
 * Canonical per-target delivery policy (R-c, R1 resolved).
 *
 * Mirrors the backend `DeliveryPolicyView` 1:1
 * (`publishing-queue/.../mappers/scheduling.mapper.ts`):
 * the random delivery delay window (`delayMinMs..delayMaxMs`), the
 * UTC-day publish ceiling (`dailyCap`, `0` = target paused), and the
 * UTC hour the daily counter resets (`resetHour`).
 *
 * Served by publishing-queue
 * (`GET/PATCH /scheduling-api/api/scheduling/delivery-policies/:target`,
 * `:4080` dev / `:4081` staging / `:4082` prod).
 */
export type DeliveryPolicyTarget = 'telegram' | 'threads';

export interface DeliveryPolicy {
  readonly delayMinMs: number;
  readonly delayMaxMs: number;
  readonly dailyCap: number;
  readonly resetHour: number;
}

export type UpdateDeliveryPolicyBody = Partial<DeliveryPolicy>;

export const deliveryPolicyKeys = {
  all: ['feed-scheduling', 'delivery-policy'] as const,
  one: (target: DeliveryPolicyTarget) =>
    [...deliveryPolicyKeys.all, target] as const,
};

export function deliveryPolicyPath(target: DeliveryPolicyTarget): string {
  return schedulingPath(
    `/api/scheduling/delivery-policies/${encodeURIComponent(target)}`,
  );
}

/**
 * A4 split: the frozen legacy scalar delay becomes a pinned window
 * (`min = max = publishDelayMs`); `resetHour` seeds from `0` UTC (the
 * old route carries no reset hour — backend `DEFAULT_RESET_HOUR`).
 */
export function deliveryPolicyFromRotationConfig(
  cfg: RotationConfigView,
  target: DeliveryPolicyTarget,
): DeliveryPolicy {
  const section = cfg[target];
  if (!section) {
    throw new Error(`rotation-config has no "${target}" section`);
  }
  const legacy = section;
  return {
    delayMinMs: legacy.publishDelayMs,
    delayMaxMs: legacy.publishDelayMs,
    dailyCap: legacy.dailyCap,
    resetHour: 0,
  };
}

/**
 * Read the new route first; on 404 (backend predates the
 * delivery-policies controller) fall back to the frozen
 * `rotation-config` route mapped through the A4 split. Any other
 * error (or a missing target section in the legacy payload)
 * rethrows.
 */
export async function fetchDeliveryPolicy(
  target: DeliveryPolicyTarget,
): Promise<DeliveryPolicy> {
  try {
    return await httpGet<DeliveryPolicy>(deliveryPolicyPath(target));
  } catch (err) {
    if (!(err instanceof HttpError) || err.status !== 404) {
      throw err;
    }
    const legacy = await fetchRotationConfig();
    if (!legacy[target]) {
      throw err;
    }
    return deliveryPolicyFromRotationConfig(legacy, target);
  }
}

export async function updateDeliveryPolicy(
  target: DeliveryPolicyTarget,
  patch: UpdateDeliveryPolicyBody,
): Promise<DeliveryPolicy> {
  return httpPatch<UpdateDeliveryPolicyBody, DeliveryPolicy>(
    deliveryPolicyPath(target),
    patch,
  );
}
