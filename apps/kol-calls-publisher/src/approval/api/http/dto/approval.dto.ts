import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EvaluateApprovalDto {
  @IsString()
  @IsNotEmpty()
  public templateId!: string;

  @IsString()
  @IsNotEmpty()
  public mentionId!: string;

  @IsOptional()
  @IsIn(['auto', 'manual'])
  public decidedBy?: 'auto' | 'manual';
}

export class DecideApprovalDto {
  @IsOptional()
  @IsString()
  public reason?: string;

  @IsOptional()
  @IsIn(['auto', 'manual'])
  public decidedBy?: 'auto' | 'manual';
}

export class PendingQueryDto {
  @IsOptional()
  @IsString()
  public templateId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public limit?: number;
}
