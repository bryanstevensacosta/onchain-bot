import { AggregateRoot } from 'shared/kernel/aggregate-root';
import { DomainEvent } from 'shared/kernel/domain-event';
import {
  validateDescription,
  validateMaxTokens,
  validateModel,
  validateName,
  validatePromptText,
  validateReasoningEffort,
  validateTemperature,
  type ReasoningEffort,
} from 'telegram/crypto-news-publisher/domain/entities/prompt-template.validators';

export type { ReasoningEffort } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.validators';

export interface PromptTemplateProps {
  readonly id: string;
  name: string;
  description: string | null;
  model: string;
  maxTokens: number;
  temperature: number;
  reasoningEffort: ReasoningEffort | null;
  promptText: string;
  systemPromptText: string;
  readonly createdAt: Date;
  updatedAt: Date;
}

/**
 * Aggregate root: a single reusable prompt template for the
 * crypto-news-publisher LLM pipeline.
 *
 * The template owns the LLM-call knobs (model, maxTokens, temperature,
 * reasoningEffort) and the prompt body. It does NOT own the publishing
 * knobs (those live on `LlmConfig` — dailyCap, targetChannel,
 * randomDelay*, llmMaxAttempts). The split mirrors the plan §T1:
 * template = "what to ask"; `LlmConfig` = "when / where to publish".
 *
 * Templates are referenced by:
 *   - `LlmConfig.defaultTemplateId` — the global default.
 *   - `Keyword.templateId` — optional per-keyword override.
 *
 * Field-level validations live in `./prompt-template.validators.ts`
 * (single source of truth — both `create()` and `update()` invoke
 * the same helpers). The `@Unique(name)` constraint is enforced at
 * the DB layer on `save()`; this aggregate does not query
 * uniqueness.
 */
export class PromptTemplate extends AggregateRoot<string> {
  private state: PromptTemplateProps;

  protected constructor(id: string, props: PromptTemplateProps) {
    super(id);
    this.state = props;
  }

  public static create(input: {
    id?: string;
    name: string;
    description?: string | null;
    model: string;
    maxTokens: number;
    temperature: number;
    reasoningEffort?: ReasoningEffort | null;
    promptText: string;
    systemPromptText?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }): PromptTemplate {
    const name = validateName(input.name);
    const description = validateDescription(input.description);
    const model = validateModel(input.model);
    const maxTokens = validateMaxTokens(input.maxTokens);
    const temperature = validateTemperature(input.temperature);
    const reasoningEffort = validateReasoningEffort(
      input.reasoningEffort ?? null,
    );
    const promptText = validatePromptText(input.promptText);
    const systemPromptText = (input.systemPromptText ?? '').trim();

    const now = new Date();
    return new PromptTemplate(input.id ?? crypto.randomUUID(), {
      id: input.id ?? crypto.randomUUID(),
      name,
      description,
      model,
      maxTokens,
      temperature,
      reasoningEffort,
      promptText,
      systemPromptText,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    });
  }

  public static reconstitute(input: PromptTemplateProps): PromptTemplate {
    return new PromptTemplate(input.id, input);
  }

  public get id(): string {
    return this.state.id;
  }

  public get name(): string {
    return this.state.name;
  }

  public get description(): string | null {
    return this.state.description;
  }

  public get model(): string {
    return this.state.model;
  }

  public get maxTokens(): number {
    return this.state.maxTokens;
  }

  public get temperature(): number {
    return this.state.temperature;
  }

  public get reasoningEffort(): ReasoningEffort | null {
    return this.state.reasoningEffort;
  }

  public get promptText(): string {
    return this.state.promptText;
  }

  public get systemPromptText(): string {
    return this.state.systemPromptText;
  }

  public get createdAt(): Date {
    return this.state.createdAt;
  }

  public get updatedAt(): Date {
    return this.state.updatedAt;
  }

  /**
   * Apply a partial update. Each provided field is re-validated
   * against the same invariants as `create()`; `updatedAt` is bumped
   * to `now`. Unspecified fields are preserved.
   */
  public update(patch: {
    name?: string;
    description?: string | null;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    reasoningEffort?: ReasoningEffort | null;
    promptText?: string;
    systemPromptText?: string;
  }): void {
    if (patch.name !== undefined) {
      this.state.name = validateName(patch.name);
    }
    if (patch.description !== undefined) {
      this.state.description = validateDescription(patch.description);
    }
    if (patch.model !== undefined) {
      this.state.model = validateModel(patch.model);
    }
    if (patch.maxTokens !== undefined) {
      this.state.maxTokens = validateMaxTokens(patch.maxTokens);
    }
    if (patch.temperature !== undefined) {
      this.state.temperature = validateTemperature(patch.temperature);
    }
    if (patch.reasoningEffort !== undefined) {
      this.state.reasoningEffort = validateReasoningEffort(
        patch.reasoningEffort,
      );
    }
    if (patch.promptText !== undefined) {
      this.state.promptText = validatePromptText(patch.promptText);
    }
    if (patch.systemPromptText !== undefined) {
      this.state.systemPromptText = patch.systemPromptText.trim();
    }
    this.state.updatedAt = new Date();
  }

  protected mutate(_event: DomainEvent): void {
    void _event;
  }
}
