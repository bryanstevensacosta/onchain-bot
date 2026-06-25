import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import type { DomainEvent } from 'shared/kernel/domain-event';

export interface TrackedPublishedCallProps {
  readonly kolId: string;
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
  readonly mcAtPublish: number;
  readonly mcNow: number | null;
  readonly milestonesHit: ReadonlyArray<number>;
  readonly maxMilestone: number | null;
  readonly priceDropPercent: number | null;
  readonly publishedAt: Date;
  readonly lastUpdatedAt: Date;
  readonly isActive: boolean;
}

export interface CreateTrackedPublishedCallInput {
  readonly kolId: string;
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
  readonly mcAtPublish: number;
  readonly publishedAt: Date;
}

/**
 * Tracks a published call for gate/filter purposes.
 *
 * Created on `publishing.telegram.published` and updated by the
 * tracking cron with current market cap + crossed milestones.
 *
 * Identity is `${chain}:${addressLowercased}` (same scheme as
 * `MonitoredCall` and `PublishedCall`) so re-publishing the same
 * (chain, address) only updates the existing row.
 */
export class TrackedPublishedCall extends AggregateRoot<string> {
  private readonly state: TrackedPublishedCallProps;

  protected constructor(id: string, props: TrackedPublishedCallProps) {
    super(id);
    this.state = props;
  }

  public static create(
    input: CreateTrackedPublishedCallInput,
  ): TrackedPublishedCall {
    if (!input.chain.trim()) {
      throw new DomainError(ErrorCode.VALIDATION, 'chain cannot be empty');
    }
    if (!input.address.trim()) {
      throw new DomainError(ErrorCode.VALIDATION, 'address cannot be empty');
    }
    if (!input.kolId.trim()) {
      throw new DomainError(ErrorCode.VALIDATION, 'kolId cannot be empty');
    }
    if (!Number.isFinite(input.mcAtPublish) || input.mcAtPublish < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'mcAtPublish must be a non-negative finite number',
      );
    }
    const normalizedAddress = input.address.toLowerCase();
    const id = `${input.chain}:${normalizedAddress}`;
    return new TrackedPublishedCall(id, {
      kolId: input.kolId,
      chain: input.chain,
      address: normalizedAddress,
      ticker: input.ticker,
      mcAtPublish: input.mcAtPublish,
      mcNow: null,
      milestonesHit: Object.freeze([]),
      maxMilestone: null,
      priceDropPercent: null,
      publishedAt: input.publishedAt,
      lastUpdatedAt: input.publishedAt,
      isActive: true,
    });
  }

  public static rehydrate(
    props: TrackedPublishedCallProps,
  ): TrackedPublishedCall {
    return new TrackedPublishedCall(`${props.chain}:${props.address}`, props);
  }

  public static buildId(chain: string, address: string): string {
    return `${chain}:${address.toLowerCase()}`;
  }

  public get id(): string {
    return `${this.state.chain}:${this.state.address}`;
  }

  public get kolId(): string {
    return this.state.kolId;
  }
  public get chain(): string {
    return this.state.chain;
  }
  public get address(): string {
    return this.state.address;
  }
  public get ticker(): string | null {
    return this.state.ticker;
  }
  public get mcAtPublish(): number {
    return this.state.mcAtPublish;
  }
  public get mcNow(): number | null {
    return this.state.mcNow;
  }
  public get milestonesHit(): ReadonlyArray<number> {
    return this.state.milestonesHit;
  }
  public get maxMilestone(): number | null {
    return this.state.maxMilestone;
  }
  public get priceDropPercent(): number | null {
    return this.state.priceDropPercent;
  }
  public get publishedAt(): Date {
    return this.state.publishedAt;
  }
  public get lastUpdatedAt(): Date {
    return this.state.lastUpdatedAt;
  }
  public get isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Apply a new tracking snapshot. Mutates internal state.
   */
  public applyTrackingSnapshot(input: {
    mcNow: number | null;
    milestonesHit: ReadonlyArray<number>;
    at: Date;
  }): void {
    const milestones = [...input.milestonesHit].sort((a, b) => a - b);
    const max =
      milestones.length > 0 ? milestones[milestones.length - 1] : null;
    const drop =
      input.mcNow !== null && this.state.mcAtPublish > 0
        ? ((input.mcNow - this.state.mcAtPublish) / this.state.mcAtPublish) *
          100
        : null;
    (this as unknown as { state: TrackedPublishedCallProps }).state = {
      ...this.state,
      mcNow: input.mcNow,
      milestonesHit: Object.freeze(milestones),
      maxMilestone: max,
      priceDropPercent: drop,
      lastUpdatedAt: input.at,
    };
  }

  public deactivate(): void {
    (this as unknown as { state: TrackedPublishedCallProps }).state = {
      ...this.state,
      isActive: false,
      lastUpdatedAt: new Date(),
    };
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
