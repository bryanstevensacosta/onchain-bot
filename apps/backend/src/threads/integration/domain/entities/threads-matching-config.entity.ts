import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainEvent } from 'shared/kernel/domain-event';

export interface ThreadsMatchingConfigProps {
  readonly id: number;
  enabled: boolean;
  updatedAt: Date;
}

/**
 * Aggregate root: single-row config for threads keyword matching.
 *
 * Controls whether the threads enqueue scheduler should enqueue
 * messages that match keywords. This is INDEPENDENT of LLM config
 * (publishing can be enabled without matching, or vice versa).
 *
 * Only ONE row exists at any time (`id = 1`).
 *
 * Persistence: @Entity({ name: 'threads_matching_configs' }) counterpart lives in
 * `threads/integration/infrastructure/persistence/typeorm/entities/` (this domain
 * file owns invariants only, never the ORM decorator).
 */
export class ThreadsMatchingConfig extends AggregateRoot<number> {
  private state: ThreadsMatchingConfigProps;

  protected constructor(id: number, props: ThreadsMatchingConfigProps) {
    super(id);
    this.state = props;
  }

  public static load(input: {
    id?: number;
    enabled?: boolean;
    updatedAt?: Date;
  }): ThreadsMatchingConfig {
    return new ThreadsMatchingConfig(input.id ?? 1, {
      id: input.id ?? 1,
      enabled: input.enabled ?? false,
      updatedAt: input.updatedAt ?? new Date(),
    });
  }

  public static reconstitute(
    input: ThreadsMatchingConfigProps,
  ): ThreadsMatchingConfig {
    return new ThreadsMatchingConfig(input.id, input);
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
