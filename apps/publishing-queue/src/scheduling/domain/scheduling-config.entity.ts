import type { SchedulingTarget } from './scheduling-target';
import {
  DeliveryPolicy,
  type DeliveryPolicyInput,
  type DeliveryPolicyProps,
} from './delivery-policy';

/**
 * Pre-R-c per-target pacing knobs.
 *
 * @deprecated Frozen on the old route only (`GET/PATCH
 *   /api/scheduling/rotation-config`). Canonical per-target pacing is
 *   {@link DeliveryPolicy} (`GET/PATCH
 *   /api/scheduling/delivery-policies/:target`). The legacy scalar
 *   `publishDelayMs` maps to a pinned window (`delayMinMs = delayMaxMs`,
 *   A4 split). Removal milestone: CUT (cutover — see refactor.md R1).
 */
export type SchedulingTargetLimits = {
  readonly publishDelayMs: number;
  readonly dailyCap: number;
};

export interface SchedulingConfigProps {
  readonly id: number;
  readonly enabled: boolean;
  readonly everyNPosts: number;
  readonly minMinutesBetweenAds: number;
  readonly telegram: DeliveryPolicy;
  readonly threads: DeliveryPolicy;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Per-target patch: canonical policy knobs + the frozen legacy scalar. */
export interface SchedulingTargetPatch extends DeliveryPolicyInput {
  /**
   * @deprecated Old-route only (`PATCH
   *   /api/scheduling/rotation-config`). Expands to `delayMinMs =
   *   delayMaxMs = publishDelayMs` (A4 split); ignored when either new
   *   delay knob is present.
   */
  readonly publishDelayMs?: number;
}

const DEFAULT_PUBLISH_DELAY_MS = 60_000;
const DEFAULT_DAILY_CAP = 20;

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function policyFromSeeds(input: {
  delayMs?: number;
  dailyCap?: number;
  resetHour?: number;
  envDelayMs: string | undefined;
  envDailyCap: string | undefined;
}): DeliveryPolicy {
  const delayMs =
    input.delayMs ?? readPositiveInt(input.envDelayMs, DEFAULT_PUBLISH_DELAY_MS);
  return DeliveryPolicy.load({
    delayMinMs: delayMs,
    delayMaxMs: delayMs,
    dailyCap:
      input.dailyCap ?? readPositiveInt(input.envDailyCap, DEFAULT_DAILY_CAP),
    ...(input.resetHour !== undefined ? { resetHour: input.resetHour } : {}),
  });
}

/**
 * Single-row configuration for the scheduling rotation (`id = 1`).
 *
 * Fail-closed seed (`enabled = false`) mirroring the backend master
 * switch. Immutable: `update()` returns a new instance.
 *
 * R-c: per-target pacing is a {@link DeliveryPolicy} (delay window +
 * daily cap + UTC reset hour). Seeds stay frozen (`SCHEDULING_*` env
 * keys unchanged).
 */
export class SchedulingConfig {
  private constructor(private readonly props: SchedulingConfigProps) {}

  public static load(input: {
    id?: number;
    enabled?: boolean;
    everyNPosts?: number;
    minMinutesBetweenAds?: number;
    telegram?: SchedulingTargetPatch;
    threads?: SchedulingTargetPatch;
    createdAt?: Date;
    updatedAt?: Date;
    env?: NodeJS.ProcessEnv;
  }): SchedulingConfig {
    const env = input.env ?? process.env;
    const now = new Date();
    const telegram = SchedulingConfig.policyFromPatch(
      policyFromSeeds({
        delayMs: input.telegram?.publishDelayMs,
        dailyCap: input.telegram?.dailyCap,
        resetHour: input.telegram?.resetHour,
        envDelayMs: env.SCHEDULING_TELEGRAM_PUBLISH_DELAY_MS,
        envDailyCap: env.SCHEDULING_TELEGRAM_DAILY_CAP,
      }),
      input.telegram,
    );
    const threads = SchedulingConfig.policyFromPatch(
      policyFromSeeds({
        delayMs: input.threads?.publishDelayMs,
        dailyCap: input.threads?.dailyCap,
        resetHour: input.threads?.resetHour,
        envDelayMs: env.SCHEDULING_THREADS_PUBLISH_DELAY_MS,
        envDailyCap: env.SCHEDULING_THREADS_DAILY_CAP,
      }),
      input.threads,
    );
    return new SchedulingConfig({
      id: input.id ?? 1,
      enabled: input.enabled ?? false,
      everyNPosts:
        input.everyNPosts ?? readPositiveInt(env.ADS_ROTATION_EVERY_N, 4),
      minMinutesBetweenAds:
        input.minMinutesBetweenAds ??
        readPositiveInt(env.SCHEDULING_MIN_MINUTES_BETWEEN_ADS, 30),
      telegram,
      threads,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    });
  }

  public static fromSnapshot(props: {
    id: number;
    enabled: boolean;
    everyNPosts: number;
    minMinutesBetweenAds: number;
    telegram: DeliveryPolicy | DeliveryPolicyProps | SchedulingTargetLimits;
    threads: DeliveryPolicy | DeliveryPolicyProps | SchedulingTargetLimits;
    createdAt: Date;
    updatedAt: Date;
  }): SchedulingConfig {
    return new SchedulingConfig({
      ...props,
      telegram: SchedulingConfig.coercePolicy(props.telegram),
      threads: SchedulingConfig.coercePolicy(props.threads),
    });
  }

  /**
   * Coerce a persisted/legacy shape into a `DeliveryPolicy` (A4 split:
   * scalar `publishDelayMs` pins the window; missing `resetHour`
   * seeds `0` UTC).
   */
  private static coercePolicy(
    raw: DeliveryPolicy | DeliveryPolicyProps | SchedulingTargetLimits,
  ): DeliveryPolicy {
    if (raw instanceof DeliveryPolicy) {
      return raw;
    }
    const legacy = raw as Partial<DeliveryPolicy> & SchedulingTargetLimits;
    if (
      typeof legacy.delayMinMs === 'number' &&
      typeof legacy.delayMaxMs === 'number'
    ) {
      return DeliveryPolicy.fromSnapshot({
        delayMinMs: legacy.delayMinMs,
        delayMaxMs: legacy.delayMaxMs,
        dailyCap: legacy.dailyCap,
        resetHour: (legacy as { resetHour?: number }).resetHour ?? 0,
      });
    }
    return DeliveryPolicy.fromLegacy({
      publishDelayMs: legacy.publishDelayMs,
      dailyCap: legacy.dailyCap,
    });
  }

  private static policyFromPatch(
    base: DeliveryPolicy,
    patch: SchedulingTargetPatch | undefined,
  ): DeliveryPolicy {
    if (!patch) {
      return base;
    }
    const { publishDelayMs: legacyScalar, ...rest } = patch;
    const delayMinMs =
      rest.delayMinMs ??
      (rest.delayMaxMs === undefined ? legacyScalar : undefined);
    const delayMaxMs =
      rest.delayMaxMs ??
      (rest.delayMinMs === undefined ? legacyScalar : undefined);
    return base.update({
      ...(delayMinMs !== undefined ? { delayMinMs } : {}),
      ...(delayMaxMs !== undefined ? { delayMaxMs } : {}),
      ...(rest.dailyCap !== undefined ? { dailyCap: rest.dailyCap } : {}),
      ...(rest.resetHour !== undefined ? { resetHour: rest.resetHour } : {}),
    });
  }

  public get id(): number {
    return this.props.id;
  }

  public get enabled(): boolean {
    return this.props.enabled;
  }

  public get everyNPosts(): number {
    return this.props.everyNPosts;
  }

  public get minMinutesBetweenAds(): number {
    return this.props.minMinutesBetweenAds;
  }

  public limitsFor(target: SchedulingTarget): DeliveryPolicy {
    return this.props[target];
  }

  /** @deprecated Old-route view only; use `limitsFor()` (DeliveryPolicy). */
  public legacyLimitsFor(target: SchedulingTarget): SchedulingTargetLimits {
    const policy = this.props[target];
    return { publishDelayMs: policy.delayMaxMs, dailyCap: policy.dailyCap };
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public update(patch: {
    enabled?: boolean;
    everyNPosts?: number;
    minMinutesBetweenAds?: number;
    telegram?: SchedulingTargetPatch;
    threads?: SchedulingTargetPatch;
  }): SchedulingConfig {
    const everyNPosts = patch.everyNPosts ?? this.props.everyNPosts;
    const minMinutesBetweenAds =
      patch.minMinutesBetweenAds ?? this.props.minMinutesBetweenAds;
    if (everyNPosts <= 0) {
      throw new Error('everyNPosts must be > 0');
    }
    if (minMinutesBetweenAds < 0) {
      throw new Error('minMinutesBetweenAds must be >= 0');
    }
    const telegram = SchedulingConfig.policyFromPatch(
      this.props.telegram,
      patch.telegram,
    );
    const threads = SchedulingConfig.policyFromPatch(
      this.props.threads,
      patch.threads,
    );
    return new SchedulingConfig({
      ...this.props,
      enabled: patch.enabled ?? this.props.enabled,
      everyNPosts,
      minMinutesBetweenAds,
      telegram,
      threads,
      updatedAt: new Date(),
    });
  }
}
