import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { KolConfidence } from 'kol/reputation/domain/value-objects/kol-reputation.vo';

export class GetTopKolsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public limit?: number;

  @IsOptional()
  @IsString()
  public minConfidence?: KolConfidence;
}
