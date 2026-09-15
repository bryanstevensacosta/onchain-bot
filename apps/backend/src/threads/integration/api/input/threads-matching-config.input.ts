import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Partial update body for the single-row ThreadsMatchingConfig (id = 1).
 *
 * SOLE source of truth for threads keyword-matching activation.
 * Mirror of crypto `UpdateMatchingConfigDto`.
 */
export class UpdateThreadsMatchingConfigDto {
  @IsOptional()
  @IsBoolean()
  public enabled?: boolean;
}
