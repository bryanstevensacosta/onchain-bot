import { dayKeyFor, type SchedulingTarget } from './scheduling-target';

/**
 * Per-target rotation cursor (P38): round-robin pointer, last publish
 * instant, and the UTC-day publish counter live per target so waits
 * and daily cutoffs are enforced independently.
 */
export interface SchedulingTargetCursor {
  readonly lastAdId: string | null;
  readonly lastPublishedAt: Date | null;
  readonly publishedToday: number;
  readonly dayKey: string | null;
}

export interface SchedulingStateProps {
  readonly id: number;
  readonly postsSinceLastAd: number;
  readonly telegram: SchedulingTargetCursor;
  readonly threads: SchedulingTargetCursor;
  readonly updatedAt: Date;
}

function emptyCursor(): SchedulingTargetCursor {
  return {
    lastAdId: null,
    lastPublishedAt: null,
    publishedToday: 0,
    dayKey: null,
  };
}

/**
 * Single-row rotation state (`id = 1`). Immutable: every command
 * returns a new instance.
 *
 * `postsSinceLastAd` stays global (one news cadence feeds both
 * targets) and resets ONCE per scheduler tick when any target
 * published — never inside `markPublished`, so the telegram publish
 * of a tick cannot starve the threads publish of the same tick.
 * Everything wait/cap related is per target. Counters roll over
 * lazily against the UTC day key: a stale `dayKey` reads as zero
 * and resets on the next `markPublished`.
 */
export class SchedulingState {
  private constructor(private readonly props: SchedulingStateProps) {}

  public static empty(): SchedulingState {
    return new SchedulingState({
      id: 1,
      postsSinceLastAd: 0,
      telegram: emptyCursor(),
      threads: emptyCursor(),
      updatedAt: new Date(),
    });
  }

  public static fromSnapshot(props: SchedulingStateProps): SchedulingState {
    return new SchedulingState(props);
  }

  public get id(): number {
    return this.props.id;
  }

  public get postsSinceLastAd(): number {
    return this.props.postsSinceLastAd;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public cursorFor(target: SchedulingTarget): SchedulingTargetCursor {
    return this.props[target];
  }

  /**
   * Publishes counted today for `target` at `at`, rolling the counter
   * when the UTC day changed since the last publish.
   */
  public publishedTodayFor(target: SchedulingTarget, at: Date): number {
    const cursor = this.props[target];
    if (cursor.dayKey === null || cursor.dayKey !== dayKeyFor(at)) {
      return 0;
    }
    return cursor.publishedToday;
  }

  public incrementPostsSinceLastAd(): SchedulingState {
    return new SchedulingState({
      ...this.props,
      postsSinceLastAd: this.props.postsSinceLastAd + 1,
      updatedAt: new Date(),
    });
  }

  public resetPostsSinceLastAd(): SchedulingState {
    return new SchedulingState({
      ...this.props,
      postsSinceLastAd: 0,
      updatedAt: new Date(),
    });
  }

  public markPublished(
    target: SchedulingTarget,
    adId: string,
    at: Date,
  ): SchedulingState {
    const cursor = this.props[target];
    const rolled = cursor.dayKey === null || cursor.dayKey !== dayKeyFor(at);
    const next: SchedulingTargetCursor = {
      lastAdId: adId,
      lastPublishedAt: at,
      publishedToday: (rolled ? 0 : cursor.publishedToday) + 1,
      dayKey: dayKeyFor(at),
    };
    return new SchedulingState({
      ...this.props,
      [target]: next,
      updatedAt: new Date(),
    });
  }
}
