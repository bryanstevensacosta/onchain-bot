import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class CreatePresetDto {
  @IsString()
  @Length(1, 100)
  public name!: string;

  @IsOptional()
  @IsString()
  public description?: string;

  @IsObject()
  public snapshot!: Record<string, unknown>;
}
