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

export class UpdateLlmConfigDto {
  @IsOptional()
  @IsString()
  public defaultTemplateId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  public targetChannel?: string;

  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;

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
