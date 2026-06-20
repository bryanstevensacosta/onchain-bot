import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class FilterConfigInput {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  public minScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
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
  public enableBlacklist?: boolean;
}

export class ApplyFiltersInput {
  @IsString()
  @IsNotEmpty()
  public chain!: string;

  @IsString()
  @IsNotEmpty()
  public address!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  public score!: number;

  @IsString()
  @IsNotEmpty()
  public classification!: string;

  @IsNumber()
  @Min(0)
  public riskWeight!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  public snapshotCompleteness!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => FilterConfigInput)
  public config?: FilterConfigInput;
}
