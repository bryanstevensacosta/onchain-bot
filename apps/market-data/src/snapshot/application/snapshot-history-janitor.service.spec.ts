import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { SNAPSHOT_HISTORY_RETENTION_DAYS } from '../infrastructure/snapshot-history.entity';
import { SnapshotHistoryJanitorService } from './snapshot-history-janitor.service';

/**
 * Failing-first spec (Tramo 3, todo 14, GAP-1).
 *
 * The 90-day janitor: `run()` prunes every row older than the
 * retention cutoff and reports the cutoff + deleted count.
 */
describe('SnapshotHistoryJanitorService (90d retention)', () => {
  it('pins the retention window at 90 days', () => {
    expect(SNAPSHOT_HISTORY_RETENTION_DAYS).toBe(90);
  });

  it('prunes rows older than 90 days and reports the cutoff', async () => {
    const history = new SnapshotHistoryRepository();
    const seen: Array<Date> = [];
    const janitor = new SnapshotHistoryJanitorService(history);
    const failing: { deleteOlderThan: (cutoff: Date) => Promise<number> } = {
      deleteOlderThan: async (cutoff: Date) => {
        seen.push(cutoff);
        return 7;
      },
    };
    const outcome = await new SnapshotHistoryJanitorService(
      failing as unknown as SnapshotHistoryRepository,
    ).run(Date.parse('2026-09-27T00:00:00.000Z'));
    expect(outcome.deleted).toBe(7);
    expect(seen).toHaveLength(1);
    const ageMs = Date.parse('2026-09-27T00:00:00.000Z') - seen[0].getTime();
    expect(ageMs).toBe(90 * 24 * 60 * 60 * 1000);
    expect(janitor).toBeDefined();
  });
});
