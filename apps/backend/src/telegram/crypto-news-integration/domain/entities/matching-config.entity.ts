import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainEvent } from 'shared/kernel/domain-event';

export interface MatchingConfigProps {
  readonly id: number;
  enabled: boolean;
  updatedAt: Date;
}

/**
 * Aggregate root: single-row config for crypto-news keyword matching.
 *
 * Controls whether the EnqueueMatchingCronScheduler should enqueue
 * messages that match keywords. This is INDEPENDENT of LLM config
 * (publishing can be enabled without matching, or vice versa).
 *
 * Only ONE row exists at any time (`id = 1`).
 */
export class MatchingConfig extends AggregateRoot<number> {
  private state: MatchingConfigProps;

  protected constructor(id: number, props: MatchingConfigProps) {
    super(id);
    this.state = props;
  }

  public static load(input: {
    id?: number;
    enabled?: boolean;
    updatedAt?: Date;
  }): MatchingConfig {
    return new MatchingConfig(input.id ?? 1, {
      id: input.id ?? 1,
      enabled: input.enabled ?? false,
      updatedAt: input.updatedAt ?? new Date(),
    });
  }

  public static reconstitute(input: MatchingConfigProps): MatchingConfig {
    return new MatchingConfig(input.id, input);
  }

  public get id(): number {
    return this.state.id;
  }

  public get enabled(): boolean {
    return this.state.enabled;
  }

  public get updatedAt(): Date {
    return this.state.updatedAt;
  }

  public update(patch: { enabled?: boolean }): void {
    if (patch.enabled !== undefined) {
      this.state.enabled = patch.enabled;
      this.state.updatedAt = new Date();
    }
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
