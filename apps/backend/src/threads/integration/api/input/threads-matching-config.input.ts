/**
 * @deprecated Moved to apps/feed-publisher/src/threads/ (Tramo 2, todo 8 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add threads logic in apps/feed-publisher/src/threads/ instead.
 */
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
