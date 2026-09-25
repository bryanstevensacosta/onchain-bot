import { AggregateRoot } from 'shared/kernel/aggregate-root';
import type { DomainEvent } from 'shared/kernel/domain-event';
import {
  validateDailyCap,
  validateDailyResetUtcHour,
  validateDefaultTemplateId,
  validateLlmMaxAttempts,
  validateRandomDelayWindow,
} from './llm-config.validators';

export interface LlmConfigProps {
  readonly id: number;
  defaultTemplateId: string;
  targetChannel: string;
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
 * Single-row config for feed LLM publishing (moved from backend
 * crypto-news-publisher, todo 5).
 *
 * Owns the publishing knobs: default template binding, target channel,
 * the llm/publishing switches, daily cap + UTC reset hour, the random
 * delay window, and the LLM retry budget. The matching switch lives in
 * `MatchingConfig` (matching module) — the 3-flag view composes both
 * rows (see `./pipeline-flags.ts`). Only ONE row exists (`id = 1`).
 */
export class LlmConfig extends AggregateRoot<number> {
  private state: LlmConfigProps;

  protected constructor(id: number, props: LlmConfigProps) {
    super(id);
    this.state = props;
  }

  public static load(input: {
    id?: number;
    defaultTemplateId: string;
    targetChannel?: string;
    llmEnabled?: boolean;
    publishingEnabled?: boolean;
    rejectNonLatin?: boolean;
    dailyCap: number;
    dailyResetUtcHour: number;
    randomDelayMinMs: number;
    randomDelayMaxMs: number;
    llmMaxAttempts: number;
    updatedAt?: Date;
  }): LlmConfig {
    const defaultTemplateId = validateDefaultTemplateId(input.defaultTemplateId);
    const dailyCap = validateDailyCap(input.dailyCap);
    const dailyResetUtcHour = validateDailyResetUtcHour(input.dailyResetUtcHour);
    const { randomDelayMinMs, randomDelayMaxMs } = validateRandomDelayWindow(
      input.randomDelayMinMs,
      input.randomDelayMaxMs,
    );
    const llmMaxAttempts = validateLlmMaxAttempts(input.llmMaxAttempts);
    return new LlmConfig(input.id ?? 1, {
      id: input.id ?? 1,
      defaultTemplateId,
      targetChannel: input.targetChannel ?? '',
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

  public static reconstitute(input: LlmConfigProps): LlmConfig {
    return new LlmConfig(input.id, input);
  }

  public get defaultTemplateId(): string {
    return this.state.defaultTemplateId;
  }

  public get targetChannel(): string {
    return this.state.targetChannel;
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
   * C-FLAGS-01: LLM generation runs ONLY when llm AND publishing are on.
   * Publishing off means nothing ships, so generating would burn API
   * calls for nothing.
   */
  public shouldGenerateLlm(): boolean {
    return this.state.llmEnabled && this.state.publishingEnabled;
  }

  public update(patch: {
    targetChannel?: string;
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
    this.state.targetChannel =
      patch.targetChannel !== undefined ? patch.targetChannel : this.state.targetChannel;
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

  public setDefaultTemplateId(templateId: string): void {
    this.state.defaultTemplateId = validateDefaultTemplateId(templateId);
    this.state.updatedAt = new Date();
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
