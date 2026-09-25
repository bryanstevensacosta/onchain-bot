import { Injectable } from '@nestjs/common';
import type { PublishingSession } from '../../domain/entities/publishing-session.entity';
import { PublishingSessionRepository } from '../../domain/ports/publishing-session.repository';

/**
 * In-memory publishing-session repository (live; TypeORM deferred GAP-1).
 */
@Injectable()
export class InMemoryPublishingSessionRepository extends PublishingSessionRepository {
  private readonly rows = new Map<string, PublishingSession>();

  public async save(session: PublishingSession): Promise<void> {
    this.rows.set(session.id, session);
  }

  public async findById(id: string): Promise<PublishingSession | null> {
    return this.rows.get(id) ?? null;
  }

  public async list(): Promise<ReadonlyArray<PublishingSession>> {
    return [...this.rows.values()];
  }

  public async remove(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}
