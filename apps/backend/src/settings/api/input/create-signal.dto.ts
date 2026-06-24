import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateSignalDto {
  @IsString()
  @Length(1, 100)
  public code!: string;

  @IsString()
  @Length(1, 200)
  public name!: string;

  @IsInt()
  public penalty!: number;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  public riskLevel!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsEnum(['token', 'kol'])
  public appliesTo!: 'token' | 'kol';

  @IsOptional()
  @IsBoolean()
  public enabled?: boolean = true;
}
