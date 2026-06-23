import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SignalInput {
  @IsString()
  @IsNotEmpty()
  public type!: string;

  @IsString()
  public severity!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsString()
  public description!: string;
}

export class ScoreTokenInput {
  @IsString()
  @IsNotEmpty()
  public chain!: string;

  @IsString()
  @IsNotEmpty()
  public address!: string;

  @IsString()
  public classification!: string;

  @IsString()
  public securityFlag!: 'SCAM' | 'SUSPICIOUS' | 'LEGITIMATE' | 'UNKNOWN';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignalInput)
  public signals!: SignalInput[];

  @IsOptional()
  @IsNumber()
  public liquidityUsd?: number | null;

  @IsOptional()
  @IsNumber()
  public marketCapUsd?: number | null;

  @IsOptional()
  @IsNumber()
  public volume24hUsd?: number | null;

  @IsOptional()
  @IsInt()
  public holders?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  public sourceCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  public mentionCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public sourceChannelIds?: string[];
}
