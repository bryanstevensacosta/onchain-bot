import { Injectable } from '@nestjs/common';
import { SNAPSHOT_HISTORY_RETENTION_DAYS } from '../infrastructure/snapshot-history.entity';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';

export interface JanitorOutcome {
  readonly cutoff: Date;
  readonly deleted: number;
}

/**
 * Snapshot history janitor (Tramo 3, todo 14, GAP-1).
 *
 * Prunes every history row older than the 90-day retention window.
 * Explicit invocation (operator runbook / future scheduler) — v1
 * ships no cron dependency in this service, so the schedule stays
 * an operator decision, not hidden behavior.
 */
@Injectable()
export class SnapshotHistoryJanitorService {
  public constructor(private readonly history: SnapshotHistoryRepository) {}

  public async run(now: number = Date.now()): Promise<JanitorOutcome> {
    const cutoff = new Date(
      now - SNAPSHOT_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const deleted = await this.history.deleteOlderThan(cutoff);
    return { cutoff, deleted };
  }
}
