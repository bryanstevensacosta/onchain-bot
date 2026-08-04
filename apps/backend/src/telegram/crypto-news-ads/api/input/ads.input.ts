import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Request DTOs for the crypto-news-ads REST API. Mirror the
 * `llm-config.input.ts` style: class-validator decorators, validated by
 * the global `ValidationPipe` (400 on shape violations).
 */

export class CreateAdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  public name!: string;

  @IsString()
  @IsNotEmpty()
  public body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  public imagePath?: string;
}

export class UpdateAdDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  public name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  public imagePath?: string | null;

  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  public order?: number;
}

export class UpdateRotationConfigDto {
  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  public everyNPosts?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  public minMinutesBetweenAds?: number;
}
