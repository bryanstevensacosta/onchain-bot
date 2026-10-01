import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateTextUseCase } from 'llm/application/use-cases/generate-text.use-case';
import { PromptCatalogService } from 'prompts/application/prompt-catalog.service';
import type { PromptSource } from 'prompts/application/prompt-catalog.service';

export interface PlaygroundDraftInput {
  readonly promptText: string;
  readonly systemPromptText?: string;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface PreviewPlaygroundInput {
  readonly name?: string;
  readonly version?: number;
  readonly draft?: PlaygroundDraftInput;
  readonly rawTitle?: string | null;
  readonly rawContent: string;
  readonly hasImage?: boolean;
  readonly generate?: boolean;
}

export interface PreviewPlaygroundResult {
  readonly renderedUserPrompt: string;
  readonly systemPrompt: string | null;
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly source: PromptSource | 'draft';
  readonly content: string | null;
  /** Contract pin: preview never writes (no enqueue, publish, persist). */
  readonly persisted: false;
}

/**
 * PreviewPlaygroundUseCase (ai-ml, todo 2): dry-run prompt preview.
 *
 * Render-only by default (zero LLM calls); `generate=true` runs
 * EXACTLY ONE generation through the gateway. Reads the versioned
 * catalog (dual-read: ai-ml first, legacy fallback) or an inline
 * draft; writes nothing — `persisted: false` is part of the contract
 * (spec-pinned). Provider outages surface explicitly (no fallback).
 *
 * Render parity with the feed-publisher migration source:
 * single-pass `{{title}}` / `{{original}}` / `{{hasImage}}`
 * (`hasImage` renders `sí`/`no`). Deviation: the ai-ml catalog v1
 * carries no per-template knobs, so template previews use gateway
 * defaults (`LLM_MODEL`, 2000 maxTokens, 0.7 temperature).
 */
@Injectable()
export class PreviewPlaygroundUseCase {
  private static readonly FALLBACK_MAX_TOKENS = 2000;
  private static readonly FALLBACK_TEMPERATURE = 0.7;

  public constructor(
    private readonly catalog: PromptCatalogService,
    private readonly generateText: GenerateTextUseCase,
    private readonly config: ConfigService,
  ) {}

  public async execute(
    input: PreviewPlaygroundInput,
  ): Promise<PreviewPlaygroundResult> {
    const name = (input.name ?? '').trim() || undefined;
    const hasName = name !== undefined;
    const hasDraft = input.draft !== undefined && input.draft !== null;
    if (hasName === hasDraft) {
      throw new BadRequestException({
        error: hasName
          ? 'provide exactly one of name or draft, not both'
          : 'provide exactly one of name or draft',
      });
    }
    if (
      typeof input.rawContent !== 'string' ||
      input.rawContent.trim().length === 0
    ) {
      throw new BadRequestException({
        error: 'rawContent must be a non-empty string',
      });
    }
    if (hasName) {
      return this.previewFromCatalog(name, input);
    }
    return this.previewFromDraft(input.draft as PlaygroundDraftInput, input);
  }

  private async previewFromCatalog(
    name: string,
    input: PreviewPlaygroundInput,
  ): Promise<PreviewPlaygroundResult> {
    const { template, source } = await this.catalog.resolve(name, {
      version: input.version,
    });
    const rendered = PreviewPlaygroundUseCase.render(template.content, {
      rawTitle: input.rawTitle ?? null,
      rawContent: input.rawContent,
      hasImage: input.hasImage ?? false,
    });
    const systemPrompt = PreviewPlaygroundUseCase.toNullable(
      template.systemContent,
    );
    const knobs = this.defaultKnobs();
    if (input.generate !== true) {
      return {
        renderedUserPrompt: rendered,
        systemPrompt,
        model: knobs.model,
        maxTokens: knobs.maxTokens,
        temperature: knobs.temperature,
        source,
        content: null,
        persisted: false,
      };
    }
    const generated = await this.generateText.execute({
      prompt: rendered,
      ...(systemPrompt !== null ? { systemPrompt } : {}),
      model: knobs.model,
      maxTokens: knobs.maxTokens,
      temperature: knobs.temperature,
    });
    return {
      renderedUserPrompt: rendered,
      systemPrompt,
      model: knobs.model,
      maxTokens: knobs.maxTokens,
      temperature: knobs.temperature,
      source,
      content: generated.text,
      persisted: false,
    };
  }

  private async previewFromDraft(
    draft: PlaygroundDraftInput,
    input: PreviewPlaygroundInput,
  ): Promise<PreviewPlaygroundResult> {
    if (
      typeof draft.promptText !== 'string' ||
      draft.promptText.trim().length === 0
    ) {
      throw new BadRequestException({
        error: 'draft.promptText must be a non-empty string',
      });
    }
    const rendered = PreviewPlaygroundUseCase.render(draft.promptText, {
      rawTitle: input.rawTitle ?? null,
      rawContent: input.rawContent,
      hasImage: input.hasImage ?? false,
    });
    const systemPrompt = PreviewPlaygroundUseCase.toNullable(
      draft.systemPromptText,
    );
    const knobs = this.draftKnobs(draft);
    if (input.generate !== true) {
      return {
        renderedUserPrompt: rendered,
        systemPrompt,
        model: knobs.model,
        maxTokens: knobs.maxTokens,
        temperature: knobs.temperature,
        source: 'draft',
        content: null,
        persisted: false,
      };
    }
    const generated = await this.generateText.execute({
      prompt: rendered,
      ...(systemPrompt !== null ? { systemPrompt } : {}),
      model: knobs.model,
      maxTokens: knobs.maxTokens,
      temperature: knobs.temperature,
    });
    return {
      renderedUserPrompt: rendered,
      systemPrompt,
      model: knobs.model,
      maxTokens: knobs.maxTokens,
      temperature: knobs.temperature,
      source: 'draft',
      content: generated.text,
      persisted: false,
    };
  }

  private defaultKnobs(): {
    model: string;
    maxTokens: number;
    temperature: number;
  } {
    return {
      model:
        (
          this.config.get<string>('LLM_MODEL', 'gpt-4o-mini') ?? 'gpt-4o-mini'
        ).trim() || 'gpt-4o-mini',
      maxTokens: PreviewPlaygroundUseCase.FALLBACK_MAX_TOKENS,
      temperature: PreviewPlaygroundUseCase.FALLBACK_TEMPERATURE,
    };
  }

  private draftKnobs(draft: PlaygroundDraftInput): {
    model: string;
    maxTokens: number;
    temperature: number;
  } {
    const defaults = this.defaultKnobs();
    return {
      model: (draft.model ?? '').trim() || defaults.model,
      maxTokens: draft.maxTokens ?? defaults.maxTokens,
      temperature: draft.temperature ?? defaults.temperature,
    };
  }

  /** Single-regex-pass substitution (parity with the feed-publisher source). */
  public static render(
    templateText: string,
    entry: { rawTitle: string | null; rawContent: string; hasImage: boolean },
  ): string {
    const hasImage = entry.hasImage ? 'sí' : 'no';
    return templateText.replace(
      /\{\{(title|original|hasImage)\}\}/g,
      (_match, key: string) => {
        switch (key) {
          case 'title':
            return entry.rawTitle ?? '';
          case 'original':
            return entry.rawContent;
          case 'hasImage':
            return hasImage;
          default:
            return _match;
        }
      },
    );
  }

  private static toNullable(value: string | undefined): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
