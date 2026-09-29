/**
 * @deprecated Moved to apps/feed-publisher/src/ingestion/ + apps/feed-publisher/src/matching/ (Tramo 2, todos 2+3 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add feed ingestion/matching logic in apps/feed-publisher/src/ingestion/ or apps/feed-publisher/src/matching/ instead.
 */
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
