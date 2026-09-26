import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Request DTOs for the scheduling REST API (P36 naming: scheduling,
 * not ads). Validated by the global `ValidationPipe` (400 on shape
 * violations).
 */
export class SchedulingButtonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  public text!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  public url!: string;
}

const FORMATS = ['text', 'photo', 'video', 'album'] as const;

export class CreateScheduledAdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  public name!: string;

  @IsString()
  @IsNotEmpty()
  @ValidateIf(
    (o: CreateScheduledAdDto) => o.format === undefined || o.format === 'text',
  )
  @MaxLength(4096)
  public body!: string;

  @IsOptional()
  @IsIn([...FORMATS])
  public format?: 'text' | 'photo' | 'video' | 'album';

  @IsOptional()
  @IsString()
  public videoMediaId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  public albumMediaIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SchedulingButtonDto)
  public buttons?: SchedulingButtonDto[];

  @IsOptional()
  @ValidateIf(
    (o: CreateScheduledAdDto) =>
      o.expiresAt !== undefined && o.expiresAt !== null,
  )
  @IsISO8601()
  public expiresAt?: string | null;

  @IsOptional()
  @IsIn(['disable', 'delete'])
  public expirationAction?: 'disable' | 'delete';
}

export class UpdateScheduledAdDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  public name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @ValidateIf(
    (o: UpdateScheduledAdDto) => o.format === undefined || o.format === 'text',
  )
  @MaxLength(4096)
  public body?: string;

  @IsOptional()
  @IsIn([...FORMATS])
  public format?: 'text' | 'photo' | 'video' | 'album';

  @IsOptional()
  @IsString()
  public videoMediaId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  public albumMediaIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SchedulingButtonDto)
  public buttons?: SchedulingButtonDto[];

  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  public order?: number;

  @IsOptional()
  @ValidateIf(
    (o: UpdateScheduledAdDto) =>
      o.expiresAt !== undefined && o.expiresAt !== null,
  )
  @IsISO8601()
  public expiresAt?: string | null;

  @IsOptional()
  @IsIn(['disable', 'delete'])
  public expirationAction?: 'disable' | 'delete';
}

export class SchedulingTargetLimitsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  public publishDelayMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  public dailyCap?: number;
}

export class UpdateSchedulingRotationConfigDto {
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

  @IsOptional()
  @ValidateNested()
  @Type(() => SchedulingTargetLimitsDto)
  public telegram?: SchedulingTargetLimitsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SchedulingTargetLimitsDto)
  public threads?: SchedulingTargetLimitsDto;
}

export class PublishScheduledAdNowDto {
  @IsOptional()
  @IsIn(['telegram', 'threads'])
  public target?: 'telegram' | 'threads';
}

export class ReuseLibraryMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID(4, { each: true })
  public libraryMediaIds!: string[];
}
