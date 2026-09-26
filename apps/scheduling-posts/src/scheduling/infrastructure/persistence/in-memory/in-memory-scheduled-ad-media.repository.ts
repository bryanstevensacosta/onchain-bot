import { Injectable } from '@nestjs/common';
import {
  ScheduledAdMediaRepository,
  type ScheduledAdMediaRecord,
} from '../../../domain/ports/scheduled-ad-media.repository';

/**
 * In-memory `ScheduledAdMediaRepository` — the LIVE binding until
 * GAP-1. Per-post attachments only; shared assets live in the media
 * library repository. Deleting a post must delete its rows first
 * (the controller owns that cascade).
 */
@Injectable()
export class InMemoryScheduledAdMediaRepository extends ScheduledAdMediaRepository {
  private readonly rows = new Map<string, ScheduledAdMediaRecord>();

  public async findById(id: string): Promise<ScheduledAdMediaRecord | null> {
    return this.rows.get(id) ?? null;
  }

  public async save(
    record: ScheduledAdMediaRecord,
  ): Promise<ScheduledAdMediaRecord> {
    this.rows.set(record.id, record);
    return record;
  }

  public async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}
