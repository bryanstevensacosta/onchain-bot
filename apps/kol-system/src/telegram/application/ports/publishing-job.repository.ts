import type { PublishingJob } from '../../domain/entities/publishing-job.entity';

/**
 * Persistence port for publishing jobs (same kol-system DB; in-memory
 * today — TypeORM entity + migration land with the persistence todo).
 */
export abstract class PublishingJobRepository {
  public abstract save(job: PublishingJob): Promise<void>;
  public abstract findById(id: string): Promise<PublishingJob | null>;
  public abstract findRecent(limit: number): Promise<PublishingJob[]>;
  public abstract findFailed(limit: number): Promise<PublishingJob[]>;
  public abstract count(): Promise<number>;
}
