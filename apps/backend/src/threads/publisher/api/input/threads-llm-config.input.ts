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
} from 'class-validator';

const THREADS_REASONING_EFFORTS = ['low', 'medium', 'high', 'max'] as const;
export type ThreadsReasoningEffortDto =
  (typeof THREADS_REASONING_EFFORTS)[number];

export class CreateThreadsPromptTemplateDto {
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
  @IsIn(THREADS_REASONING_EFFORTS)
  public reasoningEffort?: ThreadsReasoningEffortDto | null;

  @IsString()
  @Length(1)
  public promptText!: string;

  @IsOptional()
  @IsString()
  public systemPromptText?: string;
}

export class UpdateThreadsPromptTemplateDto {
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
  @IsIn(THREADS_REASONING_EFFORTS)
  public reasoningEffort?: ThreadsReasoningEffortDto | null;

  @IsOptional()
  @IsString()
  @Length(1)
  public promptText?: string;

  @IsOptional()
  @IsString()
  public systemPromptText?: string;
}

export class UpdateThreadsLlmConfigDto {
  @IsOptional()
  @IsString()
  public defaultTemplateId?: string;

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
