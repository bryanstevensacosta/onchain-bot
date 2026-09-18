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

const REASONING_EFFORTS = ['low', 'medium', 'high', 'max'] as const;
export type ReasoningEffortDto = (typeof REASONING_EFFORTS)[number];

export class CreatePromptTemplateDto {
  @IsString()
  @Length(1, 100)
  public name!: string;

  @IsOptional()
  @IsString()
  public description?: string | null;

  @IsString()
  @Length(1, 200)
  public model!: string;

  @IsOptional()
  @IsBoolean()
  public supportsVision?: boolean;

  @IsInt()
  @Min(1)
  @Max(8000)
  public maxTokens!: number;

  @IsNumber()
  @Min(0)
  @Max(2)
  public temperature!: number;

  @IsOptional()
  @IsIn(REASONING_EFFORTS)
  public reasoningEffort?: ReasoningEffortDto | null;

  @IsString()
  @Length(1)
  public promptText!: string;

  @IsOptional()
  @IsString()
  public systemPromptText?: string;
}

export class UpdatePromptTemplateDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  public name?: string;

  @IsOptional()
  @IsString()
  public description?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  public model?: string;

  @IsOptional()
  @IsBoolean()
  public supportsVision?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8000)
  public maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  public temperature?: number;

  @IsOptional()
  @IsIn(REASONING_EFFORTS)
  public reasoningEffort?: ReasoningEffortDto | null;

  @IsOptional()
  @IsString()
  @Length(1)
  public promptText?: string;

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
  @IsString()
  @Length(1)
  public promptText!: string;

  @IsOptional()
  @IsString()
  public systemPromptText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  public model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8000)
  public maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  public temperature?: number;

  @IsOptional()
  @IsIn(REASONING_EFFORTS)
  public reasoningEffort?: ReasoningEffortDto | null;

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
  @IsOptional()
  @IsString()
  public templateId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PreviewPromptDraftDto)
  public draft?: PreviewPromptDraftDto;

  @IsOptional()
  @ValidateIf(
    (o: PreviewPromptDto) => o.rawTitle !== null && o.rawTitle !== undefined,
  )
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

export class UpdateLlmConfigDto {
  @IsOptional()
  @IsString()
  public defaultTemplateId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  public targetChannel?: string;

  /**
   * @deprecated Single source of truth is crypto_news_matching_config (id=1)
   * via PATCH /crypto-news/matching/config. Sending this field to
   * PATCH /crypto-news-publisher/llm/config is rejected with 400 + hint.
   */
  @IsOptional()
  @IsBoolean()
  public matchingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  public llmEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  public publishingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  public rejectNonLatin?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public dailyCap?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  public dailyResetUtcHour?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  public randomDelayMinMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public randomDelayMaxMs?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public llmMaxAttempts?: number;
}
