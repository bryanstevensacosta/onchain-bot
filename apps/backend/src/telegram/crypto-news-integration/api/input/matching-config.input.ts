import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Partial update body for the single-row MatchingConfig (id = 1).
 *
 * SOLE source of truth for crypto-news keyword-matching activation.
 * Mirrors UpdateLlmConfigDto shape for consistency.
 */
export class UpdateMatchingConfigDto {
  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;
}
