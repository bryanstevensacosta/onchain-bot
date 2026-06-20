import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EnrichTokenInput {
  @IsString()
  @IsNotEmpty()
  public chain!: string;

  @IsString()
  @IsNotEmpty()
  public address!: string;

  @IsOptional()
  @IsBoolean()
  public force?: boolean;
}
