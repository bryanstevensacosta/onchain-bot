import { IsInt, IsOptional, IsIn, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { PublisherQueueStatus } from '../../domain/publisher-queue-status';

const STATUSES: ReadonlyArray<PublisherQueueStatus> = [
  'PENDING',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'BLOCKED',
];

/**
 * Query input for `GET /api/queue` (mirrors the backend list bounds:
 * default 50, max 500).
 */
export class ListQueueQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  public readonly limit?: number;

  @IsOptional()
  @IsIn([...STATUSES])
  public readonly status?: PublisherQueueStatus;
}
