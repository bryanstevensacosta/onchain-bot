/**
 * Domain aggregate: single-row configuration for the ads rotation.
 *
 * Not an ORM entity. Persistently backed by
 * `crypto_news_ad_rotation_config` (see TypeORM shape under
 * `infrastructure/persistence/typeorm/entities/`). There is exactly
 * one row (`id = 1`) but the two `enabled` flags must not be confused:
 * this `enabled` is the ads subsystem master switch; the shared
 * SlotArbitrator + throttle still apply regardless.
 *
 * Immutable aggregate — `update()` returns a new instance.
 */
export interface AdRotationConfigProps {
  readonly id: number;
  readonly enabled: boolean;
  readonly everyNPosts: number;
  readonly minMinutesBetweenAds: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class AdRotationConfig {
  private constructor(private readonly props: AdRotationConfigProps) {}

  public static empty(): AdRotationConfig {
    const now = new Date();
    return new AdRotationConfig({
      id: 1,
      enabled: false,
      everyNPosts: 4,
      minMinutesBetweenAds: 30,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static fromSnapshot(props: AdRotationConfigProps): AdRotationConfig {
    return new AdRotationConfig(props);
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
  }): AdRotationConfig {
    const everyNPosts =
      patch.everyNPosts !== undefined
        ? patch.everyNPosts
        : this.props.everyNPosts;
    const minMinutesBetweenAds =
      patch.minMinutesBetweenAds !== undefined
        ? patch.minMinutesBetweenAds
        : this.props.minMinutesBetweenAds;
    if (everyNPosts <= 0) {
      throw new Error('everyNPosts must be > 0');
    }
    if (minMinutesBetweenAds < 0) {
      throw new Error('minMinutesBetweenAds must be >= 0');
    }
    return new AdRotationConfig({
      ...this.props,
      enabled: patch.enabled !== undefined ? patch.enabled : this.props.enabled,
      everyNPosts,
      minMinutesBetweenAds,
      updatedAt: new Date(),
    });
  }
}
