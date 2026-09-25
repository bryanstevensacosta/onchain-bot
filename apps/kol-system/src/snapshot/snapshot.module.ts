import { Module } from '@nestjs/common';
import { MentionSnapshotRepository } from './application/ports/mention-snapshot.repository';
import { InMemoryMentionSnapshotRepository } from './infrastructure/repositories/in-memory-mention-snapshot.repository';
import { SnapshotHealthIndicator } from './health/snapshot-health.indicator';

/**
 * SnapshotModule — owns the `mention_snapshots` entity (Tramo 1, todo 8,
 * P27: own tables INSIDE the kol-system DB, no separate DB).
 *
 * Enrichment completes snapshots through the exported
 * `MentionSnapshotRepository` (same port enrichment consumes as
 * `SnapshotWriterPort`); tracking joins mention<->snapshot locally.
 */
@Module({
  providers: [
    SnapshotHealthIndicator,
    {
      provide: MentionSnapshotRepository,
      useClass: InMemoryMentionSnapshotRepository,
    },
  ],
  exports: [MentionSnapshotRepository, SnapshotHealthIndicator],
})
export class SnapshotModule {}
