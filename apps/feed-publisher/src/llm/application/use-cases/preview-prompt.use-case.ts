import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublisherQueueEntry } from '../../../queue/domain/publisher-queue-entry.entity';
import type { ReasoningEffort } from '../../domain/prompt-template.validators';
import { PromptTemplateRepository } from '../../domain/ports/prompt-template.repository';
import { FeedLlmGenerator } from '../../infrastructure/llm/feed-llm-generator.adapter';
import { LlmPort } from '../ports/llm.port';

export interface PreviewPromptDraftInput {
  readonly promptText: string;
  readonly systemPromptText?: string;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly reasoningEffort?: ReasoningEffort | null;
}

export interface PreviewPromptInput {
  readonly templateId?: string;
  readonly draft?: PreviewPromptDraftInput;
  readonly rawTitle?: string | null;
  readonly rawContent: string;
  readonly hasImage?: boolean;
  readonly generate?: boolean;
}

export interface PreviewPromptResult {
  readonly renderedUserPrompt: string;
  readonly systemPrompt: string | null;
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly reasoningEffort: string | null;
  readonly content: string | null;
}

/**
 * Dry-run playground preview. Builds a TRANSIENT queue entry (never
 * saved) and either renders the prompt or runs ONE generation. Never
 * touches the queue/throttle repos, never publishes, never calls the
 * Bot API — no persistence, no side effects.
 */
@Injectable()
export class PreviewPromptUseCase {
  private static readonly FALLBACK_MAX_TOKENS = 2000;
  private static readonly FALLBACK_TEMPERATURE = 0.7;

  public constructor(
    private readonly generator: FeedLlmGenerator,
    private readonly templateRepo: PromptTemplateRepository,
    private readonly llmPort: LlmPort,
    private readonly configService: ConfigService,
  ) {}

  public async execute(input: PreviewPromptInput): Promise<PreviewPromptResult> {
    const templateId =
      input.templateId !== undefined && input.templateId.trim().length > 0
        ? input.templateId.trim()
        : undefined;
    const hasTemplate = templateId !== undefined;
    const hasDraft = input.draft !== undefined && input.draft !== null;
    if (hasTemplate === hasDraft) {
      throw new BadRequestException({
        error: hasTemplate
          ? 'provide exactly one of templateId or draft, not both'
          : 'provide exactly one of templateId or draft',
      });
    }
    if (typeof input.rawContent !== 'string' || input.rawContent.trim().length === 0) {
      throw new BadRequestException({ error: 'rawContent must be a non-empty string' });
    }
    const entry = PublisherQueueEntry.create({
      contentType: 'crypto-news',
      channelId: 'playground-preview',
      messageId: 0,
      rawContent: input.rawContent,
      rawTitle: input.rawTitle ?? null,
      imagePaths: [],
      keywordTemplateId: templateId ?? null,
    });
    if (input.generate === true) {
      return this.generate(input, entry, templateId);
    }
    return this.renderOnly(entry, templateId, input.draft);
  }

  private async renderOnly(
    entry: PublisherQueueEntry,
    templateId: string | undefined,
    draft: PreviewPromptDraftInput | undefined,
  ): Promise<PreviewPromptResult> {
    if (templateId !== undefined) {
      const template = await this.templateRepo.findById(templateId);
      if (!template) {
        throw new NotFoundException(`PromptTemplate ${templateId} not found`);
      }
      return {
        renderedUserPrompt: this.generator.renderPromptFor(template.promptText, entry),
        systemPrompt: toNullableText(template.systemPromptText),
        model: template.model,
        maxTokens: template.maxTokens,
        temperature: template.temperature,
        reasoningEffort: template.reasoningEffort,
        content: null,
      };
    }
    const knobs = this.resolveDraftKnobs(draft as PreviewPromptDraftInput);
    return {
      renderedUserPrompt: this.generator.renderPromptFor(
        (draft as PreviewPromptDraftInput).promptText,
        entry,
      ),
      systemPrompt: toNullableText((draft as PreviewPromptDraftInput).systemPromptText),
      model: knobs.model,
      maxTokens: knobs.maxTokens,
      temperature: knobs.temperature,
      reasoningEffort: knobs.reasoningEffort,
      content: null,
    };
  }

  private async generate(
    input: PreviewPromptInput,
    entry: PublisherQueueEntry,
    templateId: string | undefined,
  ): Promise<PreviewPromptResult> {
    if (templateId !== undefined) {
      const template = await this.templateRepo.findById(templateId);
      if (!template) {
        throw new NotFoundException(`PromptTemplate ${templateId} not found`);
      }
      const generated = await this.generator.generateForEntry(entry);
      return {
        renderedUserPrompt: generated.userPrompt,
        systemPrompt: generated.systemPrompt,
        model: generated.model,
        maxTokens: template.maxTokens,
        temperature: generated.temperature ?? template.temperature,
        reasoningEffort: generated.reasoningEffort,
        content: generated.content,
      };
    }
    const draft = input.draft as PreviewPromptDraftInput;
    const knobs = this.resolveDraftKnobs(draft);
    const renderedUserPrompt = this.generator.renderPromptFor(draft.promptText, entry);
    const systemPrompt = toNullableText(draft.systemPromptText);
    const content = await this.llmPort.generateText({
      prompt: renderedUserPrompt,
      ...(systemPrompt !== null ? { systemPrompt } : {}),
      imageUrl: undefined,
      imageBase64: undefined,
      mimeType: undefined,
      model: knobs.model,
      maxTokens: knobs.maxTokens,
      temperature: knobs.temperature,
      ...(knobs.reasoningEffort !== null
        ? { reasoningEffort: knobs.reasoningEffort }
        : {}),
    });
    return {
      renderedUserPrompt,
      systemPrompt,
      model: knobs.model,
      maxTokens: knobs.maxTokens,
      temperature: knobs.temperature,
      reasoningEffort: knobs.reasoningEffort,
      content,
    };
  }

  private resolveDraftKnobs(draft: PreviewPromptDraftInput): {
    model: string;
    maxTokens: number;
    temperature: number;
    reasoningEffort: ReasoningEffort | null;
  } {
    const configured =
      this.configService.get<string>('LLM_MODEL', 'gpt-4o-mini') || 'gpt-4o-mini';
    return {
      model: draft.model || configured,
      maxTokens: draft.maxTokens ?? PreviewPromptUseCase.FALLBACK_MAX_TOKENS,
      temperature: draft.temperature ?? PreviewPromptUseCase.FALLBACK_TEMPERATURE,
      reasoningEffort: draft.reasoningEffort ?? null,
    };
  }
}

const toNullableText = (value: string | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};
