import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SCAN_PIPELINE } from '@/scan/domain/ports/scan-pipeline.port';
import type { ResolveOutcome } from '@/scan/application/pipeline/token-scan.pipeline';
import {
  TemplateRendererService,
  UnknownPlaceholder,
  UnsupportedTemplateSyntax,
} from '@/placeholders/application/template-renderer.service';
import type { TemplateValues } from '@/placeholders/application/template-renderer.service';
import type { TemplateCommand } from '@/placeholders/domain/placeholder-registry';
import { VALID_TIMEFRAMES } from '@/commands/application/handlers/c-token-chart.handler';
import { DisplayResolverService } from './display-resolver.service';
import {
  MessageTemplateValidationError,
  validateBodyMarkdown,
  validateCommand,
} from '../domain/message-template.validators';
import type { MessageTemplateRepository } from '../domain/ports/message-template.repository';

/**
 * Minimal pipeline surface the preview needs. The `SCAN_PIPELINE` token
 * is bound to `TokenScanPipeline` (which owns `resolveDetailed`); the
 * use-case depends on this structural slice — never on the impl class,
 * never on market-data HTTP, and NEVER on the bot sender (it is
 * not imported, not injected, and not provided — any send attempt
 * would throw at boot, plus the spec asserts zero bot references).
 */
export interface PreviewScanPipeline {
  resolveDetailed(address: string): Promise<ResolveOutcome>;
}

export interface PreviewTemplateDraftInput {
  readonly command: TemplateCommand;
  readonly bodyMarkdown: string;
}

export interface PreviewTemplateInput {
  readonly templateId?: string;
  readonly draft?: PreviewTemplateDraftInput;
  readonly address: string;
  readonly timeframe?: string;
}

export interface PreviewTemplateResult {
  readonly text: string;
  readonly truncated: boolean;
  readonly parseMode: 'MarkdownV2';
  readonly placeholdersUsed: string[];
  /** Always empty: the renderer throws on unknown keys instead of collecting. Kept for contract stability. */
  readonly unknown: string[];
}

/** Pipeline error shapes, propagated verbatim (same bodies as `GET /dexter/token`). */
export interface PreviewUnresolvedShape {
  readonly error: string;
  readonly address: string;
  readonly candidates?: ReadonlyArray<string>;
}

export type PreviewTemplateOutput =
  | PreviewTemplateResult
  | PreviewUnresolvedShape;

const CHART_COMMANDS: ReadonlySet<string> = new Set(['c', 'cc']);

/**
 * Dry-run template preview (dexter-message-templates todo 7).
 *
 * Transient by construction: loads a template by `templateId` XOR
 * validates an inline `draft:{command,bodyMarkdown}` — drafts are
 * NEVER persisted, the active template is NEVER touched, nothing is
 * enqueued, and nothing is sent (no bot sender anywhere in
 * this file). Pattern: feed-publisher `PreviewPromptUseCase`
 * (transient entry, render-only) — but the preview lives INSIDE the
 * templates BC because it is an action over a template.
 */
@Injectable()
export class PreviewTemplateUseCase {
  public constructor(
    @Inject(SCAN_PIPELINE)
    private readonly pipeline: PreviewScanPipeline,
    // NOTE: interface port — no @Inject token here. DexterModule binds
    // this use-case via useFactory with an explicit inject array (same
    // pattern as ChatSettingsService), so decorator metadata is never
    // consulted for this param (MESSAGE_TEMPLATE_REPOSITORY token lives
    // in the port file; specs build the use-case by hand).
    private readonly templates: MessageTemplateRepository,
    private readonly renderer: TemplateRendererService,
    private readonly displays: DisplayResolverService,
  ) {
    // The display catalog backs `{{chainDisplay}}` renders through the
    // renderer graph; holding the instance documents the render path
    // (full `DISPLAY_RESOLVER` symbol binding lands in todo 13).
    void this.displays;
  }

  public async execute(
    input: PreviewTemplateInput,
  ): Promise<PreviewTemplateOutput> {
    const templateId = PreviewTemplateUseCase.optionalId(input.templateId);
    const hasTemplate = templateId !== undefined;
    const hasDraft = input.draft !== undefined && input.draft !== null;
    if (hasTemplate === hasDraft) {
      throw new BadRequestException({
        error: hasTemplate
          ? 'provide exactly one of templateId or draft, not both'
          : 'provide exactly one of templateId or draft',
      });
    }
    if (typeof input.address !== 'string' || input.address.trim() === '') {
      throw new BadRequestException({
        error: 'address must be a non-empty string',
      });
    }

    let command: TemplateCommand;
    let body: string;
    if (hasTemplate) {
      const template = await this.templates.findById(templateId);
      if (!template) {
        throw new NotFoundException(`MessageTemplate ${templateId} not found`);
      }
      command = template.command;
      body = template.bodyMarkdown;
    } else {
      try {
        command = validateCommand(
          (input.draft as PreviewTemplateDraftInput).command,
        );
        body = validateBodyMarkdown(
          (input.draft as PreviewTemplateDraftInput).bodyMarkdown,
        );
      } catch (error) {
        throw PreviewTemplateUseCase.toBadRequest(error);
      }
    }

    PreviewTemplateUseCase.assertTimeframe(command, input.timeframe);

    const outcome = await this.pipeline.resolveDetailed(input.address);
    if (outcome.status === 'ambiguous') {
      return {
        error:
          'Ambiguous address — it resolves on more than one chain. Retry with an explicit chain qualifier (chain:address).',
        address: outcome.address,
        candidates: outcome.candidates,
      };
    }
    if (outcome.status === 'invalid') {
      return {
        error: `Invalid address: ${outcome.reason}`,
        address: outcome.address,
      };
    }
    if (outcome.status === 'not-found') {
      return { error: 'Token not found', address: outcome.address };
    }

    const values: TemplateValues = {
      ...outcome.token,
      ...(input.timeframe !== undefined ? { timeframe: input.timeframe } : {}),
    };
    try {
      const rendered = this.renderer.render(body, values, command);
      return {
        text: rendered.text,
        truncated: rendered.truncated,
        parseMode: 'MarkdownV2',
        placeholdersUsed: rendered.placeholdersUsed,
        unknown: [],
      };
    } catch (error) {
      throw PreviewTemplateUseCase.toBadRequest(error);
    }
  }

  private static optionalId(raw: unknown): string | undefined {
    if (typeof raw !== 'string') {
      return undefined;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private static assertTimeframe(
    command: TemplateCommand,
    timeframe: string | undefined,
  ): void {
    if (timeframe === undefined) {
      return;
    }
    if (!CHART_COMMANDS.has(command)) {
      throw new BadRequestException({
        error: `timeframe is only valid for c/cc templates (command: ${command})`,
      });
    }
    if (!VALID_TIMEFRAMES.has(timeframe)) {
      throw new BadRequestException({
        error: `Invalid timeframe: ${timeframe}`,
        valid: [...VALID_TIMEFRAMES],
      });
    }
  }

  private static toBadRequest(error: unknown): Error {
    if (error instanceof UnknownPlaceholder) {
      return new BadRequestException({
        error: error.message,
        valid: [...error.valid],
      });
    }
    if (error instanceof UnsupportedTemplateSyntax) {
      return new BadRequestException({ error: error.message });
    }
    if (error instanceof MessageTemplateValidationError) {
      return new BadRequestException({ error: error.message });
    }
    throw error;
  }
}
