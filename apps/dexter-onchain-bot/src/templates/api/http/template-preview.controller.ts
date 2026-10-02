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

  @IsString()
  @IsNotEmpty()
  public address!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public timeframe?: string;
}

/**
 * Dry-run preview (`POST /api/dexter/templates/preview`).
 *
 * `templateId` XOR `draft` + `address` (+ `timeframe` for c/cc) —
 * render-only: never persists, never activates, never enqueues, never
 * sends. `templateId` + `draft` together (or neither) → 400; unknown
 * placeholders in a draft → 400 + valid list; bad timeframe → 400;
 * unresolvable addresses propagate the pipeline shapes
 * (`Ambiguous…` / `Invalid address…` / `Token not found`).
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
    return this.preview.execute({
      templateId: dto.templateId,
      draft: dto.draft,
      address: dto.address,
      timeframe: dto.timeframe,
    });
  }
}
