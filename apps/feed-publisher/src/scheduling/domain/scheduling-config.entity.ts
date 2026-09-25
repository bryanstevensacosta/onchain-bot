import type { SchedulingTarget } from './scheduling-target';

/**
 * Per-target pacing knobs (P38): each delivery target configures its
 * own wait between scheduling posts and its own daily cutoff.
 * `dailyCap: 0` blocks the target outright (useful to pause one
 * target while the sibling keeps publishing).
 */
export interface SchedulingTargetLimits {
  readonly publishDelayMs: number;
  readonly dailyCap: number;
}

export interface SchedulingConfigProps {
  readonly id: number;
  readonly enabled: boolean;
  readonly everyNPosts: number;
  readonly minMinutesBetweenAds: number;
  readonly telegram: SchedulingTargetLimits;
  readonly threads: SchedulingTargetLimits;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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

/**
 * Single-row configuration for the scheduling rotation (`id = 1`).
 *
 * Fail-closed seed (`enabled = false`) mirroring the backend master
 * switch. Immutable: `update()` returns a new instance.
 */
export class SchedulingConfig {
  private constructor(private readonly props: SchedulingConfigProps) {}

  public static load(input: {
    id?: number;
    enabled?: boolean;
    everyNPosts?: number;
    minMinutesBetweenAds?: number;
    telegram?: Partial<SchedulingTargetLimits>;
    threads?: Partial<SchedulingTargetLimits>;
    createdAt?: Date;
    updatedAt?: Date;
    env?: NodeJS.ProcessEnv;
  }): SchedulingConfig {
    const env = input.env ?? process.env;
    const now = new Date();
    return new SchedulingConfig({
      id: input.id ?? 1,
      enabled: input.enabled ?? false,
      everyNPosts:
        input.everyNPosts ?? readPositiveInt(env.ADS_ROTATION_EVERY_N, 4),
      minMinutesBetweenAds:
        input.minMinutesBetweenAds ??
        readPositiveInt(env.SCHEDULING_MIN_MINUTES_BETWEEN_ADS, 30),
      telegram: {
        publishDelayMs:
          input.telegram?.publishDelayMs ??
          readPositiveInt(
            env.SCHEDULING_TELEGRAM_PUBLISH_DELAY_MS,
            DEFAULT_PUBLISH_DELAY_MS,
          ),
        dailyCap:
          input.telegram?.dailyCap ??
          readPositiveInt(env.SCHEDULING_TELEGRAM_DAILY_CAP, DEFAULT_DAILY_CAP),
      },
      threads: {
        publishDelayMs:
          input.threads?.publishDelayMs ??
          readPositiveInt(
            env.SCHEDULING_THREADS_PUBLISH_DELAY_MS,
            DEFAULT_PUBLISH_DELAY_MS,
          ),
        dailyCap:
          input.threads?.dailyCap ??
          readPositiveInt(env.SCHEDULING_THREADS_DAILY_CAP, DEFAULT_DAILY_CAP),
      },
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    });
  }

  public static fromSnapshot(props: SchedulingConfigProps): SchedulingConfig {
    return new SchedulingConfig(props);
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

  public limitsFor(target: SchedulingTarget): SchedulingTargetLimits {
    return this.props[target];
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
    telegram?: Partial<SchedulingTargetLimits>;
    threads?: Partial<SchedulingTargetLimits>;
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
    const telegram = SchedulingConfig.mergeLimits(
      this.props.telegram,
      patch.telegram,
      'telegram',
    );
    const threads = SchedulingConfig.mergeLimits(
      this.props.threads,
      patch.threads,
      'threads',
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

  private static mergeLimits(
    current: SchedulingTargetLimits,
    patch: Partial<SchedulingTargetLimits> | undefined,
    target: SchedulingTarget,
  ): SchedulingTargetLimits {
    const publishDelayMs = patch?.publishDelayMs ?? current.publishDelayMs;
    const dailyCap = patch?.dailyCap ?? current.dailyCap;
    if (publishDelayMs < 0) {
      throw new Error(`${target}.publishDelayMs must be >= 0`);
    }
    if (!Number.isInteger(dailyCap) || dailyCap < 0) {
      throw new Error(`${target}.dailyCap must be an integer >= 0`);
    }
    return { publishDelayMs, dailyCap };
  }
}
