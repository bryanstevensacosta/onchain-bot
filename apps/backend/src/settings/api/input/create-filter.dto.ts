import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateFilterDto {
  @IsString()
  @Length(1, 64)
  public type!: string;

  @IsString()
  @Length(1, 256)
  public value!: string;

  @IsOptional()
  @IsNumber()
  public numericValue?: number;

  @IsEnum(['token', 'kol', 'all', 'global'])
  public scope!: 'token' | 'kol' | 'all' | 'global';

  @IsOptional()
  @IsBoolean()
  public enabled?: boolean = true;

  @IsOptional()
  @IsString()
  public notes?: string;
}
