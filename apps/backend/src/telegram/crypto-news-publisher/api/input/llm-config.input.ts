import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const REASONING_EFFORTS = ['low', 'medium', 'high', 'max'] as const;
export type ReasoningEffortDto = (typeof REASONING_EFFORTS)[number];

export class CreatePromptTemplateDto {
  @ApiProperty({ description: 'Template name (unique)', example: 'default-news' })
  @IsString()
  @Length(1, 100)
  public name!: string;

  @ApiPropertyOptional({ description: 'Human description', example: null })
  @IsOptional()
  @IsString()
  public description?: string | null;

  @ApiProperty({ description: 'Gateway model id', example: 'opencode-zen/deepseek-v4-flash' })
  @IsString()
  @Length(1, 200)
  public model!: string;

  @ApiPropertyOptional({ description: 'Whether the template supports vision input' })
  @IsOptional()
  @IsBoolean()
  public supportsVision?: boolean;

  @ApiProperty({ description: 'Max completion tokens (1-8000)', example: 800 })
  @IsInt()
  @Min(1)
  @Max(8000)
  public maxTokens!: number;

  @ApiProperty({ description: 'Sampling temperature (0-2)', example: 0.7 })
  @IsNumber()
  @Min(0)
  @Max(2)
  public temperature!: number;

  @ApiPropertyOptional({ description: 'Reasoning effort', enum: REASONING_EFFORTS })
  @IsOptional()
  @IsIn(REASONING_EFFORTS)
  public reasoningEffort?: ReasoningEffortDto | null;

  @ApiProperty({ description: 'User prompt text' })
  @IsString()
  @Length(1)
  public promptText!: string;

  @ApiPropertyOptional({ description: 'System prompt text' })
  @IsOptional()
  @IsString()
  public systemPromptText?: string;
}

export class UpdatePromptTemplateDto {
  @ApiPropertyOptional({ description: 'Template name (unique)' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  public name?: string;

  @ApiPropertyOptional({ description: 'Human description' })
  @IsOptional()
  @IsString()
  public description?: string | null;

  @ApiPropertyOptional({ description: 'Gateway model id' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  public model?: string;

  @ApiPropertyOptional({ description: 'Whether the template supports vision input' })
  @IsOptional()
  @IsBoolean()
  public supportsVision?: boolean;

  @ApiPropertyOptional({ description: 'Max completion tokens (1-8000)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8000)
  public maxTokens?: number;

  @ApiPropertyOptional({ description: 'Sampling temperature (0-2)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  public temperature?: number;

  @ApiPropertyOptional({ description: 'Reasoning effort', enum: REASONING_EFFORTS })
  @IsOptional()
  @IsIn(REASONING_EFFORTS)
  public reasoningEffort?: ReasoningEffortDto | null;

  @ApiPropertyOptional({ description: 'User prompt text' })
  @IsOptional()
  @IsString()
  @Length(1)
  public promptText?: string;

  @ApiPropertyOptional({ description: 'System prompt text' })
  @IsOptional()
  @IsString()
  public systemPromptText?: string;
}

/**
 * Inline draft template for the playground preview endpoint
 * (`POST /crypto-news-publisher/llm/preview`). Field constraints mirror
 * `CreatePromptTemplateDto` (same model/maxTokens/temperature/
 * reasoningEffort ranges) so drafts behave like real templates; every
 * knob is optional here and falls back to the active gateway defaults
 * at generation time.
 */
export class PreviewPromptDraftDto {
  @ApiProperty({ description: 'Draft user prompt text' })
  @IsString()
  @Length(1)
  public promptText!: string;

  @ApiPropertyOptional({ description: 'Draft system prompt text' })
  @IsOptional()
  @IsString()
  public systemPromptText?: string;

  @ApiPropertyOptional({ description: 'Gateway model id override' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  public model?: string;

  @ApiPropertyOptional({ description: 'Max completion tokens (1-8000)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8000)
  public maxTokens?: number;

  @ApiPropertyOptional({ description: 'Sampling temperature (0-2)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  public temperature?: number;

  @ApiPropertyOptional({ description: 'Reasoning effort', enum: REASONING_EFFORTS })
  @IsOptional()
  @IsIn(REASONING_EFFORTS)
  public reasoningEffort?: ReasoningEffortDto | null;

  @ApiPropertyOptional({ description: 'Informational only on the dry-run path (no image bytes)' })
  @IsOptional()
  @IsBoolean()
  // Accepted so playground drafts validate; preview samples carry no image
  // bytes, so this flag is informational only on the dry-run path.
  public supportsVision?: boolean;
}

/**
 * Dry-run preview request. Exactly one of `templateId` / `draft` must be
 * present (XOR enforced in the use case with a 400). `rawContent` is the
 * article body to render; nothing is ever enqueued, published, or
 * persisted from this path.
 */
export class PreviewPromptDto {
  @ApiPropertyOptional({ description: 'Template id (XOR with draft)' })
  @IsOptional()
  @IsString()
  public templateId?: string;

  @ApiPropertyOptional({ description: 'Inline draft template (XOR with templateId)', type: PreviewPromptDraftDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PreviewPromptDraftDto)
  public draft?: PreviewPromptDraftDto;

  @ApiPropertyOptional({ description: 'Article title override (nullable)' })
  @IsOptional()
  @ValidateIf(
    (o: PreviewPromptDto) => o.rawTitle !== null && o.rawTitle !== undefined,
  )
  @IsString()
  public rawTitle?: string | null;

  @ApiProperty({ description: 'Article body to render' })
  @IsString()
  @Length(1)
  public rawContent!: string;

  @ApiPropertyOptional({ description: 'Whether the article has an image' })
  @IsOptional()
  @IsBoolean()
  public hasImage?: boolean;

  @ApiPropertyOptional({ description: 'When true, make one real LLM call; otherwise render only' })
  @IsOptional()
  @IsBoolean()
  public generate?: boolean;
}

export class UpdateLlmConfigDto {
  @ApiPropertyOptional({ description: 'Default prompt template id' })
  @IsOptional()
  @IsString()
  public defaultTemplateId?: string;

  @ApiPropertyOptional({ description: 'Target Telegram channel', example: '-1001234567890' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  public targetChannel?: string;

  @ApiPropertyOptional({ description: 'LLM refinement enabled (locked in production; requires publishingEnabled)' })
  @IsOptional()
  @IsBoolean()
  public llmEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Master publishing switch (queue drain)' })
  @IsOptional()
  @IsBoolean()
  public publishingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Reject non-Latin LLM output' })
  @IsOptional()
  @IsBoolean()
  public rejectNonLatin?: boolean;

  @ApiPropertyOptional({ description: 'Max publishes per day (min 1)', example: 36 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public dailyCap?: number;

  @ApiPropertyOptional({ description: 'UTC hour of the daily cap reset (0-23)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  public dailyResetUtcHour?: number;

  @ApiPropertyOptional({ description: 'Min random delay between publishes (ms)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  public randomDelayMinMs?: number;

  @ApiPropertyOptional({ description: 'Max random delay between publishes (ms, min 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public randomDelayMaxMs?: number;

  @ApiPropertyOptional({ description: 'Max LLM attempts per article (min 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public llmMaxAttempts?: number;
}
