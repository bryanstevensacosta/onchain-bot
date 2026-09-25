import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type { RankingStrategy } from '../../../domain/entities/publishing-template.entity';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  public name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public kolSourceIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public minVisibleScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public gemMinScore?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public gemPatterns?: string[];

  @IsOptional()
  @IsIn(['score', 'engagement', 'recency', 'weighted'])
  public rankingStrategy?: RankingStrategy;

  @IsOptional()
  @IsInt()
  @Min(1)
  public rankingLimit?: number;

  @IsOptional()
  @IsObject()
  public rankingWeights?: {
    score: number;
    engagement: number;
    recency: number;
  };
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public kolSourceIds?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public minVisibleScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public gemMinScore?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public gemPatterns?: string[];

  @IsOptional()
  @IsIn(['score', 'engagement', 'recency', 'weighted'])
  public rankingStrategy?: RankingStrategy;

  @IsOptional()
  @IsInt()
  @Min(1)
  public rankingLimit?: number;

  @IsOptional()
  @IsObject()
  public rankingWeights?: {
    score: number;
    engagement: number;
    recency: number;
  };
}

export class UpdateSourcesDto {
  @IsArray()
  @IsString({ each: true })
  public kolSourceIds!: string[];
}

export class AssignChannelDto {
  @IsString()
  @IsNotEmpty()
  public botId!: string;

  @IsString()
  @IsNotEmpty()
  public channelTarget!: string;
}

export class RankingsQueryDto {
  @IsOptional()
  @IsIn(['score', 'engagement', 'recency', 'weighted'])
  public strategy?: RankingStrategy;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public limit?: number;
}

export class CreateBotDto {
  @IsString()
  @IsNotEmpty()
  public label!: string;

  @IsString()
  @IsNotEmpty()
  public token!: string;
}

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public label?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public token?: string;
}
