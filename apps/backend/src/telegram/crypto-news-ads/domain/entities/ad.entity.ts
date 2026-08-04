import * as crypto from 'node:crypto';

/**
 * Domain aggregate for a publishable crypto-news ad.
 *
 * Not an ORM entity. Owns no persistence annotations — the TypeORM
 * shape lives at
 * `infrastructure/persistence/typeorm/entities/ad.entity.ts` and the
 * mapper translates between the two.
 *
 * Immutable: every command returns a new instance (matching the
 * `SharedThrottleState.withLastPublishAt` style) so the aggregate can
 * never be mutated in place and accidentally diverge from what was
 * persisted.
 */
export interface AdProps {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly imagePath: string | null;
  readonly enabled: boolean;
  readonly order: number;
  readonly timesPublished: number;
  readonly consecutiveFailures: number;
  readonly lastPublishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Ad {
  private constructor(private readonly props: AdProps) {}

  public static create(input: {
    id?: string;
    name: string;
    body: string;
    imagePath?: string | null;
    order?: number;
  }): Ad {
    const now = new Date();
    return new Ad({
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      body: input.body,
      imagePath: input.imagePath ?? null,
      enabled: true,
      order: input.order ?? 0,
      timesPublished: 0,
      consecutiveFailures: 0,
      lastPublishedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static fromSnapshot(props: AdProps): Ad {
    return new Ad(props);
  }

  public get id(): string {
    return this.props.id;
  }

  public get name(): string {
    return this.props.name;
  }

  public get body(): string {
    return this.props.body;
  }

  public get imagePath(): string | null {
    return this.props.imagePath;
  }

  public get enabled(): boolean {
    return this.props.enabled;
  }

  public get order(): number {
    return this.props.order;
  }

  public get timesPublished(): number {
    return this.props.timesPublished;
  }

  public get consecutiveFailures(): number {
    return this.props.consecutiveFailures;
  }

  public get lastPublishedAt(): Date | null {
    return this.props.lastPublishedAt;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public enable(): Ad {
    return this.with({ enabled: true });
  }

  public disable(): Ad {
    return this.with({ enabled: false });
  }

  public markPublished(now: Date): Ad {
    return this.with({
      timesPublished: this.props.timesPublished + 1,
      consecutiveFailures: 0,
      lastPublishedAt: now,
    });
  }

  public incrementFailure(): Ad {
    return this.with({
      consecutiveFailures: this.props.consecutiveFailures + 1,
    });
  }

  public bumpOrder(n: number): Ad {
    return this.with({ order: this.props.order + n });
  }

  private with(patch: Partial<AdProps>): Ad {
    return new Ad({ ...this.props, ...patch, updatedAt: new Date() });
  }
}
