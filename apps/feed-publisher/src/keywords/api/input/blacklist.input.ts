import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { MatchMode } from '../../domain/match-mode';

export class CreateBlacklistPhraseDto {
  @IsString()
  @MaxLength(200)
  public phrase!: string;

  @ApiPropertyOptional({ description: 'Case-sensitive match' })
  @IsOptional()
  @IsBoolean()
  public caseSensitive?: boolean;

  @ApiPropertyOptional({ description: 'exact (word-boundary) or substring' })
  @IsOptional()
  @IsIn(['exact', 'substring'])
  public matchMode?: MatchMode;

  @ApiPropertyOptional({ description: 'Enabled for blocking' })
  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;

  @ApiPropertyOptional({ description: 'Channel scope (empty = every channel)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public sourceChannelIds?: string[];

  @ApiPropertyOptional({
    description: 'AND-group id (null = simple OR phrase)',
  })
  @IsOptional()
  public andGroupId?: string | null;

  @ApiPropertyOptional({ description: 'Only block messages carrying media' })
  @IsOptional()
  @IsBoolean()
  public requireMedia?: boolean;
}

export class UpdateBlacklistPhraseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public phrase?: string;

  @IsOptional()
  @IsBoolean()
  public caseSensitive?: boolean;

  @IsOptional()
  @IsIn(['exact', 'substring'])
  public matchMode?: MatchMode;

  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public sourceChannelIds?: string[];

  @IsOptional()
  public andGroupId?: string | null;

  @IsOptional()
  @IsBoolean()
  public requireMedia?: boolean;
}

export class CreateBlacklistBatchDto {
  @IsArray()
  public phrases!: Array<{
    phrase: string;
    caseSensitive?: boolean;
    matchMode?: MatchMode;
    enabled?: boolean;
    sourceChannelIds?: string[];
    requireMedia?: boolean;
  }>;
}
