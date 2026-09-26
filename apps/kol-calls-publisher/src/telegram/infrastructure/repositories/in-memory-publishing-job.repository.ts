import { Injectable } from '@nestjs/common';
import { PublishingJobRepository } from '../../application/ports/publishing-job.repository';
import type { PublishingJob } from '../../domain/entities/publishing-job.entity';

/** In-memory job store, newest first on reads. */
@Injectable()
export class InMemoryPublishingJobRepository extends PublishingJobRepository {
  private readonly rows = new Map<string, PublishingJob>();

  public async save(job: PublishingJob): Promise<void> {
    this.rows.set(job.id, job);
  }

  public async findById(id: string): Promise<PublishingJob | null> {
    return this.rows.get(id) ?? null;
  }

  public async findRecent(limit: number): Promise<PublishingJob[]> {
    return [...this.rows.values()]
      .sort((a, b) => b.createdAtDate.getTime() - a.createdAtDate.getTime())
      .slice(0, limit);
  }

  public async findFailed(limit: number): Promise<PublishingJob[]> {
    return [...this.rows.values()]
      .filter((j) => j.status === 'failed')
      .sort((a, b) => b.createdAtDate.getTime() - a.createdAtDate.getTime())
      .slice(0, limit);
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }
}
