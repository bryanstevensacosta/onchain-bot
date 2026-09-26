import { Body, Controller, Post } from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RequireScope } from 'auth/application/require-scope.decorator';
import {
  PreviewPlaygroundUseCase,
  type PreviewPlaygroundResult,
} from '../../application/preview-playground.use-case';

class PlaygroundDraftDto {
  @IsString()
  @Length(1)
  public promptText!: string;

  @IsOptional()
  @IsString()
  public systemPromptText?: string;

  @IsOptional()
  @IsString()
  public model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  public maxTokens?: number;

  @IsOptional()
  public temperature?: number;
}

class PreviewPlaygroundDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  public name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  public version?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlaygroundDraftDto)
  public draft?: PlaygroundDraftDto;

  @IsOptional()
  @IsString()
  public rawTitle?: string | null;

  @IsString()
  @Length(1)
  public rawContent!: string;

  @IsOptional()
  @IsBoolean()
  public hasImage?: boolean;

  @IsOptional()
  @IsBoolean()
  public generate?: boolean;
}

/**
 * Playground HTTP surface (ai-ml, todo 2):
 * - POST /api/playground/preview (generate): render a catalog
 *   template (or inline draft) against sample content, optionally
 *   with ONE dry-run generation. Never enqueues, publishes, or
 *   persists (`persisted: false` in every response).
 */
@Controller('api/playground')
export class PlaygroundController {
  public constructor(private readonly preview: PreviewPlaygroundUseCase) {}

  @Post('preview')
  @RequireScope('generate')
  public async previewPrompt(
    @Body() dto: PreviewPlaygroundDto,
  ): Promise<PreviewPlaygroundResult> {
    return this.preview.execute({
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.version !== undefined ? { version: dto.version } : {}),
      ...(dto.draft !== undefined ? { draft: { ...dto.draft } } : {}),
      ...(dto.rawTitle !== undefined ? { rawTitle: dto.rawTitle } : {}),
      rawContent: dto.rawContent,
      ...(dto.hasImage !== undefined ? { hasImage: dto.hasImage } : {}),
      ...(dto.generate !== undefined ? { generate: dto.generate } : {}),
    });
  }
}
