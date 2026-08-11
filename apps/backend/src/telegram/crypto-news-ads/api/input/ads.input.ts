import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
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
  @ValidateIf((o) => o.expiresAt !== undefined && o.expiresAt !== null)
  @IsISO8601()
  public expiresAt?: string | null;

  @IsOptional()
  @IsIn(['disable', 'delete'])
  public expirationAction?: 'disable' | 'delete';
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
  @IsBoolean()
  public enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  public order?: number;

  @IsOptional()
  @ValidateIf((o) => o.expiresAt !== undefined && o.expiresAt !== null)
  @IsISO8601()
  public expiresAt?: string | null;

  @IsOptional()
  @IsIn(['disable', 'delete'])
  public expirationAction?: 'disable' | 'delete';
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

export class ReuseAdImageDto {
  @IsUUID()
  public libraryMediaId!: string;
}
