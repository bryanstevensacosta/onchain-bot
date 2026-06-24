import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateFilterDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  public type?: string;

  @IsOptional()
  @IsString()
  @Length(1, 256)
  public value?: string;

  @IsOptional()
  @IsNumber()
  public numericValue?: number;

  @IsOptional()
  @IsEnum(['token', 'kol', 'all', 'global'])
  public scope?: 'token' | 'kol' | 'all' | 'global';

  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;

  @IsOptional()
  @IsString()
  public notes?: string;
}
