import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ListTrackedCallsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10)
  public min_milestone?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  public max_price_drop?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  public has_milestones?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public limit?: number;
}

export class GateAllowBodyDto {
  @IsString()
  @Length(1, 32)
  public chain!: string;

  @IsString()
  @Length(1, 128)
  public address!: string;
}
