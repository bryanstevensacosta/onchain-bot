import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class UpdatePresetDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  public name?: string;

  @IsOptional()
  @IsString()
  public description?: string;

  @IsOptional()
  @IsObject()
  public snapshot?: Record<string, unknown>;
}
