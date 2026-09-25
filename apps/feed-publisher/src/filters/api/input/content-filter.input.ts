import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContentFilterDto {
  @IsString()
  @MaxLength(512)
  public pattern!: string;

  @ApiPropertyOptional({ description: 'Replacement ($1, $2 for groups)' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  public replacement?: string;

  @ApiPropertyOptional({ description: 'Regex flags subset of gimsuy' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  public flags?: string;

  @ApiPropertyOptional({ description: 'Lower runs first' })
  @IsOptional()
  @IsInt()
  @Min(0)
  public priority?: number;

  @ApiPropertyOptional({ description: 'Active rules apply on-read' })
  @IsOptional()
  @IsBoolean()
  public isActive?: boolean;
}

export class UpdateContentFilterDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  public pattern?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  public replacement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  public flags?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  public priority?: number;

  @IsOptional()
  @IsBoolean()
  public isActive?: boolean;
}
