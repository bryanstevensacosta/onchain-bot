import { IsEnum, IsInt, IsString, Length, Max, Min } from 'class-validator';

export class CreateThresholdDto {
  @IsEnum(['token', 'kol'])
  public scope!: 'token' | 'kol';

  @IsInt()
  @Min(0)
  @Max(100)
  public minScore!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  public maxScore!: number;

  @IsString()
  @Length(1, 32)
  public decision!: string;
}
