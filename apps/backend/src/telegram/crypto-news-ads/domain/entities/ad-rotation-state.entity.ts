/**
 * Domain aggregate: single-row mutable state for the ads rotation.
 *
 * Not an ORM entity. Persistently backed by
 * `crypto_news_ad_rotation_state` (see TypeORM shape under
 * `infrastructure/persistence/typeorm/entities/`). There is exactly
 * one row (`id = 1`).
 *
 * Immutable aggregate — commands return a new instance.
 */
export interface AdRotationStateProps {
  readonly id: number;
  readonly postsSinceLastAd: number;
  readonly lastAdId: string | null;
  readonly lastAdPublishedAt: Date | null;
  readonly updatedAt: Date;
}

export class AdRotationState {
  private constructor(private readonly props: AdRotationStateProps) {}

  public static empty(): AdRotationState {
    return new AdRotationState({
      id: 1,
      postsSinceLastAd: 0,
      lastAdId: null,
      lastAdPublishedAt: null,
      updatedAt: new Date(),
    });
  }

  public static fromSnapshot(props: AdRotationStateProps): AdRotationState {
    return new AdRotationState(props);
  }

  public get id(): number {
    return this.props.id;
  }

  public get postsSinceLastAd(): number {
    return this.props.postsSinceLastAd;
  }

  public get lastAdId(): string | null {
    return this.props.lastAdId;
  }

  public get lastAdPublishedAt(): Date | null {
    return this.props.lastAdPublishedAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public incrementPostsSinceLastAd(): AdRotationState {
    return new AdRotationState({
      ...this.props,
      postsSinceLastAd: this.props.postsSinceLastAd + 1,
      updatedAt: new Date(),
    });
  }

  public resetPostsSinceLastAd(): AdRotationState {
    return new AdRotationState({
      ...this.props,
      postsSinceLastAd: 0,
      updatedAt: new Date(),
    });
  }

  public withAdPublished(adId: string, at: Date): AdRotationState {
    return new AdRotationState({
      ...this.props,
      postsSinceLastAd: 0,
      lastAdId: adId,
      lastAdPublishedAt: at,
      updatedAt: new Date(),
    });
  }
}
