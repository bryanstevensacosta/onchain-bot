import { AggregateRoot } from 'shared/kernel/aggregate-root';
import type { DomainEvent } from 'shared/kernel/domain-event';
import type { ContentType } from 'shared/value-objects/content-type.vo';
import {
  validateContentType,
  validateDescription,
  validateMaxTokens,
  validateModel,
  validateName,
  validatePromptText,
  validateReasoningEffort,
  validateTemperature,
  type ReasoningEffort,
  type TemplateContentType,
} from './prompt-template.validators';

export type { ReasoningEffort, TemplateContentType } from './prompt-template.validators';

export interface PromptTemplateProps {
  readonly id: string;
  name: string;
  description: string | null;
  contentType: TemplateContentType;
  model: string;
  supportsVision: boolean;
  maxTokens: number;
  temperature: number;
  reasoningEffort: ReasoningEffort | null;
  promptText: string;
  systemPromptText: string;
  readonly createdAt: Date;
  updatedAt: Date;
}

/**
 * Reusable prompt template for the feed LLM pipeline (moved from backend
 * crypto-news-publisher, todo 5).
 *
 * The catalog is GLOBAL (P33/P34): a template with
 * `contentType === 'global'` applies to every feed type; scoped rows
 * (`'crypto-news'` / `'threads'`) apply only to their own type. The
 * template owns the LLM-call knobs (model, maxTokens, temperature,
 * reasoningEffort, prompt body); publishing knobs live on `LlmConfig`.
 * Referenced by `LlmConfig.defaultTemplateId` and the per-keyword
 * `Keyword.templateId` override (keywords module, FK-less).
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
    contentType?: TemplateContentType;
    model: string;
    supportsVision?: boolean;
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
    const contentType = validateContentType(input.contentType);
    const model = validateModel(input.model);
    const maxTokens = validateMaxTokens(input.maxTokens);
    const temperature = validateTemperature(input.temperature);
    const reasoningEffort = validateReasoningEffort(input.reasoningEffort ?? null);
    const promptText = validatePromptText(input.promptText);
    const systemPromptText = (input.systemPromptText ?? '').trim();
    const now = new Date();
    const id = input.id ?? crypto.randomUUID();
    return new PromptTemplate(id, {
      id,
      name,
      description,
      contentType,
      model,
      supportsVision: input.supportsVision ?? true,
      maxTokens,
      temperature,
      reasoningEffort,
      promptText,
      systemPromptText,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    });
  }

  public static reconstitute(input: {
    id: string;
    name: string;
    description: string | null;
    contentType: TemplateContentType;
    model: string;
    supportsVision: boolean;
    maxTokens: number;
    temperature: number;
    reasoningEffort: ReasoningEffort | null;
    promptText: string;
    systemPromptText: string;
    createdAt: Date;
    updatedAt: Date;
  }): PromptTemplate {
    return new PromptTemplate(input.id, input);
  }

  public get name(): string {
    return this.state.name;
  }

  public get description(): string | null {
    return this.state.description;
  }

  public get contentType(): TemplateContentType {
    return this.state.contentType;
  }

  public get model(): string {
    return this.state.model;
  }

  public get supportsVision(): boolean {
    return this.state.supportsVision;
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

  /** GLOBAL rows apply to every content type; scoped rows to their own. */
  public appliesTo(contentType: ContentType): boolean {
    return this.state.contentType === 'global' || this.state.contentType === contentType;
  }

  public update(patch: {
    name?: string;
    description?: string | null;
    contentType?: TemplateContentType;
    model?: string;
    supportsVision?: boolean;
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
    if (patch.contentType !== undefined) {
      this.state.contentType = validateContentType(patch.contentType);
    }
    if (patch.model !== undefined) {
      this.state.model = validateModel(patch.model);
    }
    if (patch.supportsVision !== undefined) {
      this.state.supportsVision = patch.supportsVision;
    }
    if (patch.maxTokens !== undefined) {
      this.state.maxTokens = validateMaxTokens(patch.maxTokens);
    }
    if (patch.temperature !== undefined) {
      this.state.temperature = validateTemperature(patch.temperature);
    }
    if (patch.reasoningEffort !== undefined) {
      this.state.reasoningEffort = validateReasoningEffort(patch.reasoningEffort);
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
