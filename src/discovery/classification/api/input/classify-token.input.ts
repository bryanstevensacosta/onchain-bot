import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ClassifyTokenInput {
  @IsString()
  @IsNotEmpty()
  public chain!: string;

  @IsString()
  @IsNotEmpty()
  public address!: string;

  @IsBoolean()
  public hasPairs!: boolean;

  @IsInt()
  @Min(0)
  public pairCount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public liquidityUsd?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  public marketCapUsd?: number | null;

  @IsOptional()
  @IsNumber()
  public priceChange24h?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  public holders?: number | null;

  @IsOptional()
  @IsNumber()
  public top10HolderPercent?: number | null;

  @IsOptional()
  @IsBoolean()
  public hasName?: boolean;

  @IsOptional()
  @IsBoolean()
  public hasTicker?: boolean;

  @IsOptional()
  @IsNumber()
  public completeness?: number;

  @IsOptional()
  @IsArray()
  public signals?: unknown[];
}
