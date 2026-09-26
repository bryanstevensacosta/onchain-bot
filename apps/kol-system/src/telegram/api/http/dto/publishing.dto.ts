import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PublishFromTemplateDto {
  @IsString()
  @IsNotEmpty()
  public templateId!: string;

  @IsString()
  @IsNotEmpty()
  public mentionId!: string;

  @IsOptional()
  @IsString()
  public ticker?: string | null;

  @IsString()
  @IsNotEmpty()
  public chain!: string;

  @IsString()
  @IsNotEmpty()
  public address!: string;

  @IsOptional()
  @IsNumber()
  public marketCapUsd?: number;

  @IsOptional()
  @IsString()
  public chart?: string;
}

export class ManualPublishDto {
  @IsString()
  @IsNotEmpty()
  public botId!: string;

  @IsString()
  @IsNotEmpty()
  public channelTarget!: string;

  @IsOptional()
  @IsString()
  public mentionId?: string;

  @IsOptional()
  @IsString()
  public templateId?: string;

  @IsOptional()
  @IsString()
  public ticker?: string | null;

  @IsString()
  @IsNotEmpty()
  public chain!: string;

  @IsString()
  @IsNotEmpty()
  public address!: string;

  @IsOptional()
  @IsNumber()
  public marketCapUsd?: number;

  @IsOptional()
  @IsString()
  public chart?: string;
}

export class RecentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public limit?: number;
}

export class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public limit?: number;
}
