import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class EvaluateCallInputDto {
  @IsString()
  @IsNotEmpty()
  public channelId!: string;

  @IsString()
  @IsNotEmpty()
  public chain!: string;

  @IsString()
  @IsNotEmpty()
  public address!: string;

  @IsOptional()
  @IsNumber()
  public mcAtCall?: number | null;

  @Type(() => Date)
  @IsDate()
  public callTimestamp!: Date;
}

export class GetTopChannelsQueryDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  public limit?: number;

  @IsOptional()
  @IsString()
  public minConfidence?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
}
