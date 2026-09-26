import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Pagination query for the P51 snapshots contract.
 *
 * `limit` 1..500 (default 50), `offset` >= 0 (default 0). `@Type(() => Number)`
 * coerces query strings (same gotcha as the approvals/templates DTOs).
 */
export class SnapshotsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public readonly limit: number = 50;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  public readonly offset: number = 0;
}
