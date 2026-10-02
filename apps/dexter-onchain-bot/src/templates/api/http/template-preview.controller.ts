import { Body, Controller, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TEMPLATE_COMMANDS } from '@/placeholders/domain/placeholder-registry';
import type { TemplateCommand } from '@/placeholders/domain/placeholder-registry';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { MAX_BODY_LENGTH } from '@/templates/domain/message-template.validators';
import {
  PreviewTemplateUseCase,
  type PreviewTemplateOutput,
} from '@/templates/application/preview-template.use-case';

/**
 * Inline draft: a transient `{command, bodyMarkdown}` pair. It is
 * validated like a stored template but NEVER persisted (preview-only).
 */
export class PreviewTemplateDraftDto {
  @IsString()
  @IsIn([...TEMPLATE_COMMANDS])
  public command!: TemplateCommand;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_BODY_LENGTH)
  public bodyMarkdown!: string;
}

export class PreviewTemplateRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public templateId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PreviewTemplateDraftDto)
  public draft?: PreviewTemplateDraftDto;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public address?: string;

  /**
   * Resolved-token snapshot (fetch-once support for the live editor):
   * a plain object matching `ResolvedToken`, echoed back by a previous
   * preview's `token` field. Lightly validated in `previewTemplate`
   * (object + string `address`/`chain`/`symbol`); deep validation is
   * NOT required — the renderer tolerates missing keys as N/A.
   */
  @IsOptional()
  public token?: ResolvedToken;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public timeframe?: string;
}

/**
 * Dry-run preview (`POST /api/dexter/templates/preview`).
 *
 * `templateId` XOR `draft` + `address` XOR `token` (+ `timeframe` for
 * c/cc) — render-only: never persists, never activates, never
 * enqueues, never sends. `templateId` + `draft` together (or neither)
 * → 400; `address` + `token` together (or neither) → 400; a `token`
 * that is not an object with string `address`/`chain`/`symbol` → 400;
 * unknown placeholders in a draft → 400 + valid list; bad timeframe →
 * 400; unresolvable addresses propagate the pipeline shapes
 * (`Ambiguous…` / `Invalid address…` / `Token not found`).
 *
 * Success gains `token: ResolvedToken` (pipeline-resolved for the
 * `address` path, echoed snapshot for the `token` path) — the live
 * editor resolves once via `address`, then re-renders drafts with the
 * returned `token` (pipeline skipped, same text). Unresolved shapes
 * carry NO `token` field (byte-identical to before).
 *
 * v1 sin auth como /dexter/token — same unauthenticated regime as the
 * existing `/dexter/*` lookup surface; auth arrives in a later phase.
 */
@Controller('api/dexter/templates/preview')
export class TemplatePreviewController {
  public constructor(private readonly preview: PreviewTemplateUseCase) {}

  @Post()
  public async previewTemplate(
    @Body() dto: PreviewTemplateRequestDto,
  ): Promise<PreviewTemplateOutput> {
    if (dto.token !== undefined && dto.token !== null) {
      PreviewTemplateUseCase.assertTokenSnapshot(dto.token);
    }
    return this.preview.execute({
      templateId: dto.templateId,
      draft: dto.draft,
      address: dto.address,
      token: dto.token,
      timeframe: dto.timeframe,
    });
  }
}
