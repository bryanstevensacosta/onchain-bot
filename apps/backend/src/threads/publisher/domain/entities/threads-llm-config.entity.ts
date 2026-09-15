import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainEvent } from 'shared/kernel/domain-event';
import {
  validateDailyCap,
  validateDailyResetUtcHour,
  validateDefaultTemplateId,
  validateLlmMaxAttempts,
  validateRandomDelayWindow,
} from './threads-llm-config.validators';

export interface ThreadsLlmConfigProps {
  readonly id: number;
  defaultTemplateId: string;
  llmEnabled: boolean;
  publishingEnabled: boolean;
  rejectNonLatin: boolean;
  dailyCap: number;
  dailyResetUtcHour: number;
  randomDelayMinMs: number;
  randomDelayMaxMs: number;
  llmMaxAttempts: number;
  updatedAt: Date;
}

/**
 * Aggregate root: a single-row config for threads LLM publishing.
 *
 * Owns the GLOBAL publishing knobs:
 *   - which `ThreadsPromptTemplate` is the default for unmatched keywords
 *   - two independent on/off switches:
 *     • llmEnabled: whether to generate content with LLM (false = publish raw)
 *     • publishingEnabled: whether to publish from the queue at all
 *   - daily cap and the UTC hour at which it resets
 *   - the random delay window between consecutive publishes
 *   - the LLM retry budget before a queue entry is marked FAILED
 *
 * NOTE: unlike the crypto-news mirror, there is NO target channel column
 * (Threads publishes to the single authenticated account) and NO
 * matchingEnabled legacy field (matching lives in ThreadsMatchingConfig).
 *
 * Only ONE row exists at any time (`id = 1`).
 *
 * Persistence: @Entity({ name: 'threads_llm_configs' }) counterpart lives in
 * `threads/publisher/infrastructure/persistence/typeorm/entities/` (this domain
 * file owns invariants only, never the ORM decorator).
 *
 * Field-level validations live in `./threads-llm-config.validators.ts`
 * (single source of truth — both `load()` and `update()` invoke the
 * same helpers).
 */
export class ThreadsLlmConfig extends AggregateRoot<number> {
  private state: ThreadsLlmConfigProps;

  protected constructor(id: number, props: ThreadsLlmConfigProps) {
    super(id);
    this.state = props;
  }

  /**
   * Factory: validate invariants and build a fresh ThreadsLlmConfig.
   * Use `reconstitute()` when loading from persistence.
   */
  public static load(input: {
    id?: number;
    defaultTemplateId: string;
    llmEnabled?: boolean;
    publishingEnabled?: boolean;
    rejectNonLatin?: boolean;
    dailyCap: number;
    dailyResetUtcHour: number;
    randomDelayMinMs: number;
    randomDelayMaxMs: number;
    llmMaxAttempts: number;
    updatedAt?: Date;
  }): ThreadsLlmConfig {
    const defaultTemplateId = validateDefaultTemplateId(
      input.defaultTemplateId,
    );
    const dailyCap = validateDailyCap(input.dailyCap);
    const dailyResetUtcHour = validateDailyResetUtcHour(
      input.dailyResetUtcHour,
    );
    const { randomDelayMinMs, randomDelayMaxMs } = validateRandomDelayWindow(
      input.randomDelayMinMs,
      input.randomDelayMaxMs,
    );
    const llmMaxAttempts = validateLlmMaxAttempts(input.llmMaxAttempts);

    return new ThreadsLlmConfig(input.id ?? 1, {
      id: input.id ?? 1,
      defaultTemplateId,
      llmEnabled: input.llmEnabled ?? false,
      publishingEnabled: input.publishingEnabled ?? false,
      rejectNonLatin: input.rejectNonLatin ?? true,
      dailyCap,
      dailyResetUtcHour,
      randomDelayMinMs,
      randomDelayMaxMs,
      llmMaxAttempts,
      updatedAt: input.updatedAt ?? new Date(),
    });
  }

  public static reconstitute(input: ThreadsLlmConfigProps): ThreadsLlmConfig {
    return new ThreadsLlmConfig(input.id, input);
  }

  public get id(): number {
    return this.state.id;
  }

  public get defaultTemplateId(): string {
    return this.state.defaultTemplateId;
  }

  public get llmEnabled(): boolean {
    return this.state.llmEnabled;
  }

  public get publishingEnabled(): boolean {
    return this.state.publishingEnabled;
  }

  public get rejectNonLatin(): boolean {
    return this.state.rejectNonLatin;
  }

  public get dailyCap(): number {
    return this.state.dailyCap;
  }

  public get dailyResetUtcHour(): number {
    return this.state.dailyResetUtcHour;
  }

  public get randomDelayMinMs(): number {
    return this.state.randomDelayMinMs;
  }

  public get randomDelayMaxMs(): number {
    return this.state.randomDelayMaxMs;
  }

  public get llmMaxAttempts(): number {
    return this.state.llmMaxAttempts;
  }

  public get updatedAt(): Date {
    return this.state.updatedAt;
  }

  /**
   * Apply a partial update to the publishing knobs. Validates the
   * same invariants as `load()`. `defaultTemplateId`, `id`, and
   * `updatedAt` are not editable through this method (use
   * `setDefaultTemplateId` to swap the binding).
   */
  public update(patch: {
    llmEnabled?: boolean;
    publishingEnabled?: boolean;
    rejectNonLatin?: boolean;
    dailyCap?: number;
    dailyResetUtcHour?: number;
    randomDelayMinMs?: number;
    randomDelayMaxMs?: number;
    llmMaxAttempts?: number;
  }): void {
    const dailyCap = validateDailyCap(
      patch.dailyCap !== undefined ? patch.dailyCap : this.state.dailyCap,
    );
    const dailyResetUtcHour = validateDailyResetUtcHour(
      patch.dailyResetUtcHour !== undefined
        ? patch.dailyResetUtcHour
        : this.state.dailyResetUtcHour,
    );
    const { randomDelayMinMs, randomDelayMaxMs } = validateRandomDelayWindow(
      patch.randomDelayMinMs !== undefined
        ? patch.randomDelayMinMs
        : this.state.randomDelayMinMs,
      patch.randomDelayMaxMs !== undefined
        ? patch.randomDelayMaxMs
        : this.state.randomDelayMaxMs,
    );
    const llmMaxAttempts = validateLlmMaxAttempts(
      patch.llmMaxAttempts !== undefined
        ? patch.llmMaxAttempts
        : this.state.llmMaxAttempts,
    );

    this.state.llmEnabled =
      patch.llmEnabled !== undefined ? patch.llmEnabled : this.state.llmEnabled;
    this.state.publishingEnabled =
      patch.publishingEnabled !== undefined
        ? patch.publishingEnabled
        : this.state.publishingEnabled;
    this.state.rejectNonLatin =
      patch.rejectNonLatin !== undefined
        ? patch.rejectNonLatin
        : this.state.rejectNonLatin;
    this.state.dailyCap = dailyCap;
    this.state.dailyResetUtcHour = dailyResetUtcHour;
    this.state.randomDelayMinMs = randomDelayMinMs;
    this.state.randomDelayMaxMs = randomDelayMaxMs;
    this.state.llmMaxAttempts = llmMaxAttempts;
    this.state.updatedAt = new Date();
  }

  /**
   * Swap the default template binding (e.g. when the operator picks
   * a different template from the dropdown).
   */
  public setDefaultTemplateId(templateId: string): void {
    this.state.defaultTemplateId = validateDefaultTemplateId(templateId);
    this.state.updatedAt = new Date();
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
