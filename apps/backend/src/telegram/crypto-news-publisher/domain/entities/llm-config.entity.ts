import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainEvent } from 'shared/kernel/domain-event';
import {
  validateDailyCap,
  validateDailyResetUtcHour,
  validateDefaultTemplateId,
  validateLlmMaxAttempts,
  validateRandomDelayWindow,
} from 'telegram/crypto-news-publisher/domain/entities/llm-config.validators';

export interface LlmConfigProps {
  readonly id: number;
  defaultTemplateId: string;
  targetChannel: string;
  enabled: boolean;
  dailyCap: number;
  dailyResetUtcHour: number;
  randomDelayMinMs: number;
  randomDelayMaxMs: number;
  llmMaxAttempts: number;
  updatedAt: Date;
}

/**
 * Aggregate root: a single-row config for crypto-news LLM publishing.
 *
 * Owns the GLOBAL publishing knobs:
 *   - which `PromptTemplate` is the default for unmatched keywords
 *   - which Telegram channel publishes to
 *   - whether the publisher is enabled at all
 *   - daily cap and the UTC hour at which it resets
 *   - the random delay window between consecutive publishes
 *   - the LLM retry budget before a queue entry is marked FAILED
 *
 * Only ONE row exists at any time (`id = 1`). The `LlmConfigRepository`
 * contract reads/writes that single row. The migration service
 * (`LlmConfigMigrationService`) seeds it idempotently on first boot
 * after this wave lands — see plan §T1.
 *
 * The aggregate does NOT own LLM-call knobs (model, maxTokens,
 * temperature, reasoningEffort, promptText). Those live on
 * `PromptTemplate` and rotate independently.
 *
 * Field-level validations live in `./llm-config.validators.ts`
 * (single source of truth — both `load()` and `update()` invoke the
 * same helpers).
 */
export class LlmConfig extends AggregateRoot<number> {
  private state: LlmConfigProps;

  protected constructor(id: number, props: LlmConfigProps) {
    super(id);
    this.state = props;
  }

  /**
   * Factory: validate invariants and build a fresh LlmConfig.
   * Used by the migration service when seeding from JSON or
   * defaults; use `reconstitute()` when loading from persistence.
   */
  public static load(input: {
    id?: number;
    defaultTemplateId: string;
    targetChannel?: string;
    enabled?: boolean;
    dailyCap: number;
    dailyResetUtcHour: number;
    randomDelayMinMs: number;
    randomDelayMaxMs: number;
    llmMaxAttempts: number;
    updatedAt?: Date;
  }): LlmConfig {
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

    return new LlmConfig(input.id ?? 1, {
      id: input.id ?? 1,
      defaultTemplateId,
      targetChannel: input.targetChannel ?? '',
      enabled: input.enabled ?? false,
      dailyCap,
      dailyResetUtcHour,
      randomDelayMinMs,
      randomDelayMaxMs,
      llmMaxAttempts,
      updatedAt: input.updatedAt ?? new Date(),
    });
  }

  public static reconstitute(input: LlmConfigProps): LlmConfig {
    return new LlmConfig(input.id, input);
  }

  public get id(): number {
    return this.state.id;
  }

  public get defaultTemplateId(): string {
    return this.state.defaultTemplateId;
  }

  public get targetChannel(): string {
    return this.state.targetChannel;
  }

  public get enabled(): boolean {
    return this.state.enabled;
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
   * `setDefaultTemplateId` to swap the binding, or the repository to
   * persist).
   */
  public update(patch: {
    targetChannel?: string;
    enabled?: boolean;
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

    this.state.targetChannel =
      patch.targetChannel !== undefined
        ? patch.targetChannel
        : this.state.targetChannel;
    this.state.enabled =
      patch.enabled !== undefined ? patch.enabled : this.state.enabled;
    this.state.dailyCap = dailyCap;
    this.state.dailyResetUtcHour = dailyResetUtcHour;
    this.state.randomDelayMinMs = randomDelayMinMs;
    this.state.randomDelayMaxMs = randomDelayMaxMs;
    this.state.llmMaxAttempts = llmMaxAttempts;
    this.state.updatedAt = new Date();
  }

  /**
   * Swap the default template binding (e.g. when the operator picks
   * a different template from the dropdown). The resolver
   * (caller / adapter) verifies the template actually exists at use
   * time, not here.
   */
  public setDefaultTemplateId(templateId: string): void {
    this.state.defaultTemplateId = validateDefaultTemplateId(templateId);
    this.state.updatedAt = new Date();
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
