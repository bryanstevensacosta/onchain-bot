import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { RankingStrategy } from '../../../domain/entities/publishing-template.entity';

class ScoringBonusesDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  public liquidityThresholdHigh?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public liquidityHigh?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public liquidityThresholdMedium?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public liquidityMedium?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public liquidityThresholdLow?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public liquidityLow?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public liquidityInsufficient?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public holdersThresholdHigh?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public holdersHigh?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public holdersThresholdMedium?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public holdersMedium?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public holdersThresholdLow?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public holdersLow?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public holdersNone?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public mcThresholdHigh?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public mcHigh?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public mcThresholdMedium?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public mcMedium?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public mcThresholdLow?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public mcLow?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public volumeThresholdHigh?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public volumeHigh?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public volumeThresholdLow?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public volumeLow?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public buzzMultiSource?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public buzzTwoSources?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public buzzMultiMentions?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  public buzzTwoMentions?: number;
}

class ScoringSignalPenaltiesDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public CRITICAL?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public HIGH?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public MEDIUM?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public LOW?: number;
}

class ScoringSecurityCapsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public SCAM?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public SUSPICIOUS?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public UNKNOWN?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public LEGITIMATE?: number;
}

class ScoringTiersDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public strong?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public decent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public neutral?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public risky?: number;
}

class ScoringGatesDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public minScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public maxRiskWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  public minCompleteness?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public blockedClassifications?: string[];

  @IsOptional()
  @IsBoolean()
  public enableBlacklist?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public blacklistedAddresses?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public honeypotScoreBelow?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public honeypotRiskAbove?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public publishableChains?: string[];
}

export class ScoringConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public baseScore?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScoringBonusesDto)
  public bonuses?: ScoringBonusesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScoringSignalPenaltiesDto)
  public signalPenalties?: ScoringSignalPenaltiesDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScoringSecurityCapsDto)
  public securityCaps?: ScoringSecurityCapsDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  public multiplierPivot?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  public multiplierSlope?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScoringTiersDto)
  public tiers?: ScoringTiersDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScoringGatesDto)
  public gates?: ScoringGatesDto;
}

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

  @IsOptional()
  @ValidateNested()
  @Type(() => ScoringConfigDto)
  public scoringConfig?: ScoringConfigDto;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => ScoringConfigDto)
  public scoringConfig?: ScoringConfigDto;
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
