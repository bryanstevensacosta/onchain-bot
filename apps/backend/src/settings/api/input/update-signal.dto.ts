import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateSignalDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  public name?: string;

  @IsOptional()
  @IsInt()
  public penalty?: number;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  public riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;
}
