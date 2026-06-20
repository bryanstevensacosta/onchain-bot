import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class PublishCallInput {
  @IsString()
  @IsNotEmpty()
  public chain!: string;

  @IsString()
  @IsNotEmpty()
  public address!: string;

  @IsOptional()
  @IsString()
  public ticker?: string | null;

  @IsOptional()
  @IsString()
  public name?: string | null;

  @IsNumber()
  @Min(0)
  public score!: number;

  @IsString()
  @IsNotEmpty()
  public classification!: string;

  @IsOptional()
  @IsNumber()
  public marketCapUsd?: number | null;

  @IsOptional()
  @IsNumber()
  public liquidityUsd?: number | null;

  @IsOptional()
  @IsInt()
  public holders?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  public sourceCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  public mentionCount?: number;

  @IsOptional()
  @IsString()
  public chart?: string | null;
}
