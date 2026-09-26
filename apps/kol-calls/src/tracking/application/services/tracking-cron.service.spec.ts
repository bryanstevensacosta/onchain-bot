import { TrackingCronService } from './tracking-cron.service';
import { InMemoryTrackedMentionRepository } from '../../infrastructure/repositories/in-memory-tracked-mention.repository';
import { InMemoryKolWindowStatRepository } from '../../infrastructure/repositories/in-memory-kol-window-stat.repository';
import { TrackedMention } from '../../domain/entities/tracked-mention.entity';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function at(msAgo: number): Date {
  return new Date(NOW.getTime() - msAgo);
}

async function seed(
  repo: InMemoryTrackedMentionRepository,
  rows: Array<{
    kolId: string;
    address: string;
    firstMc: number | null;
    lastMc: number | null;
    times: number;
    lastSeenAgoMs: number;
  }>,
): Promise<void> {
  for (const row of rows) {
    const firstSeen = new Date(at(row.lastSeenAgoMs).getTime() - HOUR);
    const tracked = TrackedMention.create({
      kolId: row.kolId,
      chain: 'solana',
      address: row.address,
      mentionId: `${row.kolId}:1:0`,
      mcAt: row.firstMc,
      seenAt: firstSeen,
    });
    for (let i = 1; i < row.times; i += 1) {
      tracked.recordCall({
        mentionId: `${row.kolId}:${i + 1}:0`,
        mcAt: i === row.times - 1 ? row.lastMc : row.firstMc,
        seenAt: new Date(firstSeen.getTime() + i * 1_000),
      });
    }
    // Pin the latest observation (mc + recency) exactly as the fixture says.
    tracked.pinForTest(row.lastMc, at(row.lastSeenAgoMs));
    await repo.save(tracked);
  }
}

describe('TrackingCronService (todo 12, failing-first)', () => {
  it('rebuilds kol_window_stats with correct sums and counts per window (3-caller fixture)', async () => {
    const tracked = new InMemoryTrackedMentionRepository();
    const stats = new InMemoryKolWindowStatRepository();
    await seed(tracked, [
      // callerA: old row, inside 30d only (20d ago), 1x, 3 calls.
      {
        kolId: 'callerA',
        address: 'A',
        firstMc: 100,
        lastMc: 100,
        times: 3,
        lastSeenAgoMs: 20 * DAY,
      },
      // callerB: 2d ago (30d + 7d), 600/100 = 6x STRONG, 2 calls.
      {
        kolId: 'callerB',
        address: 'B',
        firstMc: 100,
        lastMc: 600,
        times: 2,
        lastSeenAgoMs: 2 * DAY,
      },
      // callerC: 2h ago (all windows), 400/200 = 2x, 1 call.
      {
        kolId: 'callerC',
        address: 'C',
        firstMc: 200,
        lastMc: 400,
        times: 1,
        lastSeenAgoMs: 2 * HOUR,
      },
    ]);
    const cron = new TrackingCronService(tracked, stats);
    await cron.rebuild(NOW);

    const d30 = await stats.findByWindow('30d');
    expect(
      d30
        .map((s) => [s.caller, s.totalX, s.callsCount, s.strongCalls])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['callerA', 1, 3, 0],
      ['callerB', 6, 2, 1],
      ['callerC', 2, 1, 0],
    ]);

    const d7 = await stats.findByWindow('7d');
    expect(
      d7
        .map((s) => [s.caller, s.totalX, s.callsCount, s.strongCalls])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['callerB', 6, 2, 1],
      ['callerC', 2, 1, 0],
    ]);

    const d1 = await stats.findByWindow('1d');
    expect(
      d1.map((s) => [s.caller, s.totalX, s.callsCount, s.strongCalls]),
    ).toEqual([['callerC', 2, 1, 0]]);
  });

  it('skips rows with null mc (no-data) instead of poisoning the sum', async () => {
    const tracked = new InMemoryTrackedMentionRepository();
    const stats = new InMemoryKolWindowStatRepository();
    await seed(tracked, [
      {
        kolId: 'callerD',
        address: 'D',
        firstMc: null,
        lastMc: 500,
        times: 1,
        lastSeenAgoMs: HOUR,
      },
    ]);
    const cron = new TrackingCronService(tracked, stats);
    await cron.rebuild(NOW);
    const d30 = await stats.findByWindow('30d');
    expect(
      d30.map((s) => [s.caller, s.totalX, s.callsCount, s.strongCalls]),
    ).toEqual([['callerD', 0, 1, 0]]);
  });
});
