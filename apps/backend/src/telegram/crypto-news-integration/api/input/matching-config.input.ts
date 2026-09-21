import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Partial update body for the single-row MatchingConfig (id = 1).
 *
 * SOLE source of truth for crypto-news keyword-matching activation.
 * Mirrors UpdateLlmConfigDto shape for consistency.
 */
export class UpdateMatchingConfigDto {
  @ApiPropertyOptional({
    description: 'Keyword-matching activation flag',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;
}
