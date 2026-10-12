/**
 * DeliveryPolicy value object (R-c, R1 RESUELTA + A4/A7/B11).
 *
 * Per-target pacing knobs (`telegram | threads`): the random delivery
 * delay window (`delayMinMs..delayMaxMs`), the UTC-day publish ceiling
 * (`dailyCap`, `0` = target paused), and the UTC hour the daily counter
 * resets (`resetHour`).
 *
 * Migration rule (A4): `delayMinMs = delayMaxMs = publishDelayMs`
 * (conserves exact-time behaviour); `resetHour = dailyResetUtcHour`
 * (else `0` UTC) — see `fromLegacy()`.
 *
 * Pure: no I/O, no env reads (seeds live in `SchedulingConfig.load`).
 * Immutable: `update()` returns a new instance.
 */

export interface DeliveryPolicyProps {
  readonly delayMinMs: number;
  readonly delayMaxMs: number;
  readonly dailyCap: number;
  readonly resetHour: number;
}

export interface DeliveryPolicyInput {
  readonly delayMinMs?: number;
  readonly delayMaxMs?: number;
  readonly dailyCap?: number;
  readonly resetHour?: number;
}

/** Legacy scalar shape (pre-R-c `SchedulingTargetLimits`). */
export interface LegacyTargetLimitsInput {
  readonly publishDelayMs: number;
  readonly dailyCap?: number;
  readonly resetHour?: number;
}

export const DEFAULT_DELAY_MS = 60_000;
export const DEFAULT_DAILY_CAP = 20;
export const DEFAULT_RESET_HOUR = 0;

function assertPolicyInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be an integer >= 0`);
  }
}

function assertPolicyProps(props: DeliveryPolicyProps): void {
  assertPolicyInt('delayMinMs', props.delayMinMs);
  assertPolicyInt('delayMaxMs', props.delayMaxMs);
  assertPolicyInt('dailyCap', props.dailyCap);
  assertPolicyInt('resetHour', props.resetHour);
  if (props.delayMinMs > props.delayMaxMs) {
    throw new Error(
      `delayMinMs must be <= delayMaxMs (min=${props.delayMinMs}, max=${props.delayMaxMs})`,
    );
  }
}

export class DeliveryPolicy {
  private constructor(private readonly props: DeliveryPolicyProps) {}

  public static load(input: DeliveryPolicyInput): DeliveryPolicy {
    return new DeliveryPolicy(
      DeliveryPolicy.normalize({
        delayMinMs: input.delayMinMs ?? DEFAULT_DELAY_MS,
        delayMaxMs: input.delayMaxMs ?? DEFAULT_DELAY_MS,
        dailyCap: input.dailyCap ?? DEFAULT_DAILY_CAP,
        resetHour: input.resetHour ?? DEFAULT_RESET_HOUR,
      }),
    );
  }

  public static fromSnapshot(props: DeliveryPolicyProps): DeliveryPolicy {
    return new DeliveryPolicy(DeliveryPolicy.normalize({ ...props }));
  }

  /**
   * A4 split: the legacy scalar delay becomes a pinned window
   * (`min = max = publishDelayMs`); `resetHour` seeds from the legacy
   * `dailyResetUtcHour`, else `0` UTC.
   */
  public static fromLegacy(input: LegacyTargetLimitsInput): DeliveryPolicy {
    return DeliveryPolicy.load({
      delayMinMs: input.publishDelayMs,
      delayMaxMs: input.publishDelayMs,
      ...(input.dailyCap !== undefined ? { dailyCap: input.dailyCap } : {}),
      ...(input.resetHour !== undefined ? { resetHour: input.resetHour } : {}),
    });
  }

  private static normalize(props: DeliveryPolicyProps): DeliveryPolicyProps {
    assertPolicyProps(props);
    return { ...props };
  }

  public get delayMinMs(): number {
    return this.props.delayMinMs;
  }

  public get delayMaxMs(): number {
    return this.props.delayMaxMs;
  }

  public get dailyCap(): number {
    return this.props.dailyCap;
  }

  public get resetHour(): number {
    return this.props.resetHour;
  }

  public toSnapshot(): DeliveryPolicyProps {
    return { ...this.props };
  }

  /**
   * Roll one delivery delay in `[delayMinMs, delayMaxMs]` (inclusive)
   * from `rng()` (defaults to `Math.random`).
   */
  public rollDelayMs(rng: () => number = Math.random): number {
    const span = this.props.delayMaxMs - this.props.delayMinMs + 1;
    return this.props.delayMinMs + Math.floor(rng() * span);
  }

  public update(patch: DeliveryPolicyInput): DeliveryPolicy {
    return new DeliveryPolicy(
      DeliveryPolicy.normalize({
        delayMinMs: patch.delayMinMs ?? this.props.delayMinMs,
        delayMaxMs: patch.delayMaxMs ?? this.props.delayMaxMs,
        dailyCap: patch.dailyCap ?? this.props.dailyCap,
        resetHour: patch.resetHour ?? this.props.resetHour,
      }),
    );
  }
}

export interface CreateDeliveryEtaInput {
  readonly delayMinMs: number;
  readonly delayMaxMs: number;
  readonly now?: Date;
  readonly rng?: () => number;
}

/**
 * Pin a delivery ETA: `{ etaMs, deadlineAt = now + etaMs }`.
 */
export function createDeliveryEta(input: CreateDeliveryEtaInput): {
  readonly etaMs: number;
  readonly deadlineAt: Date;
} {
  const policy = DeliveryPolicy.load({
    delayMinMs: input.delayMinMs,
    delayMaxMs: input.delayMaxMs,
  });
  const etaMs = policy.rollDelayMs(input.rng ?? Math.random);
  const now = input.now ?? new Date();
  return { etaMs, deadlineAt: new Date(now.getTime() + etaMs) };
}

/** True when `now` is past `deadlineAt` (a null deadline is never late). */
export function isLate(deadlineAt: Date | null, now: Date = new Date()): boolean {
  if (deadlineAt === null) {
    return false;
  }
  return now.getTime() > deadlineAt.getTime();
}
