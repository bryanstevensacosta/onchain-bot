/**
 * Delivery-ETA helpers (R-b1).
 *
 * Queue entries carry a delivery ETA (`etaMs` + `deadlineAt`, nullable
 * for exact-time posts) plus a `late` flag. The delay rolls once at
 * enqueue time from the injected rng; retries never re-roll
 * (`releaseToPending` preserves the deadline).
 */

export interface RollDelayInput {
  readonly minMs: number;
  readonly maxMs: number;
  readonly rng?: () => number;
}

export interface DeliveryEtaInput {
  readonly delayMinMs: number;
  readonly delayMaxMs: number;
  readonly now?: Date;
  readonly rng?: () => number;
}

/**
 * Roll a delivery delay in `[minMs, maxMs]` (inclusive) from `rng()`.
 * Throws on inverted or negative/non-finite bounds.
 */
export function rollDelayMs(input: RollDelayInput): number {
  const { minMs, maxMs } = input;
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    throw new Error(
      `rollDelayMs needs finite bounds (minMs=${minMs}, maxMs=${maxMs})`,
    );
  }
  if (minMs < 0 || maxMs < 0) {
    throw new Error(
      `rollDelayMs needs non-negative bounds (minMs=${minMs}, maxMs=${maxMs})`,
    );
  }
  if (minMs > maxMs) {
    throw new Error(
      `rollDelayMs needs minMs <= maxMs (minMs=${minMs}, maxMs=${maxMs})`,
    );
  }
  const rng = input.rng ?? Math.random;
  const span = maxMs - minMs + 1;
  return minMs + Math.floor(rng() * span);
}

/**
 * Pin a delivery ETA: `{ etaMs, deadlineAt = now + etaMs }`.
 */
export function createDeliveryEta(input: DeliveryEtaInput): {
  readonly etaMs: number;
  readonly deadlineAt: Date;
} {
  const etaMs = rollDelayMs({
    minMs: input.delayMinMs,
    maxMs: input.delayMaxMs,
    ...(input.rng !== undefined ? { rng: input.rng } : {}),
  });
  const now = input.now ?? new Date();
  return { etaMs, deadlineAt: new Date(now.getTime() + etaMs) };
}
