import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateThresholdDto {
  @IsOptional()
  @IsEnum(['token', 'kol'])
  public scope?: 'token' | 'kol';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  public minScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  public maxScore?: number;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  public decision?: string;
}
