import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { MatchMode } from '../../domain/match-mode';

export class CreateKeywordDto {
  @IsString()
  @MaxLength(200)
  public phrase!: string;

  @ApiPropertyOptional({ description: 'Case-sensitive match' })
  @IsOptional()
  @IsBoolean()
  public caseSensitive?: boolean;

  @ApiPropertyOptional({ description: 'Enabled for matching' })
  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;

  @ApiPropertyOptional({ description: 'Channel scope (empty = every channel)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public sourceChannelIds?: string[];

  @ApiPropertyOptional({
    description: 'Prompt-template override (null = default)',
  })
  @IsOptional()
  public templateId?: string | null;

  @ApiPropertyOptional({
    description: 'AND-group id (null = simple OR keyword)',
  })
  @IsOptional()
  @IsUUID()
  public andGroupId?: string | null;

  @ApiPropertyOptional({ description: 'Only match messages carrying media' })
  @IsOptional()
  @IsBoolean()
  public requireMedia?: boolean;

  @ApiPropertyOptional({ description: 'exact (word-boundary) or substring' })
  @IsOptional()
  @IsIn(['exact', 'substring'])
  public matchMode?: MatchMode;
}

export class UpdateKeywordDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public phrase?: string;

  @IsOptional()
  @IsBoolean()
  public caseSensitive?: boolean;

  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public sourceChannelIds?: string[];

  @IsOptional()
  public templateId?: string | null;

  @IsOptional()
  public andGroupId?: string | null;

  @IsOptional()
  @IsBoolean()
  public requireMedia?: boolean;

  @IsOptional()
  @IsIn(['exact', 'substring'])
  public matchMode?: MatchMode;
}

export class CreateKeywordBatchDto {
  @IsArray()
  public phrases!: Array<{
    phrase: string;
    caseSensitive?: boolean;
    enabled?: boolean;
    sourceChannelIds?: string[];
    templateId?: string | null;
    requireMedia?: boolean;
    matchMode?: MatchMode;
  }>;
}
