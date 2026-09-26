import { GetKolRankingsUseCase } from './get-kol-rankings.use-case';
import { RankingsController } from '../../api/http/rankings.controller';
import { InMemoryKolWindowStatRepository } from '../../infrastructure/repositories/in-memory-kol-window-stat.repository';
import { KolWindowStat } from '../../domain/entities/kol-window-stat.entity';

async function seed(): Promise<InMemoryKolWindowStatRepository> {
  const repo = new InMemoryKolWindowStatRepository();
  await repo.save(
    KolWindowStat.create({
      caller: 'alice',
      window: '30d',
      totalX: 12,
      callsCount: 5,
      strongCalls: 1,
    }),
  );
  await repo.save(
    KolWindowStat.create({
      caller: 'bob',
      window: '30d',
      totalX: 20,
      callsCount: 2,
      strongCalls: 2,
    }),
  );
  await repo.save(
    KolWindowStat.create({
      caller: 'cara',
      window: '30d',
      totalX: 3,
      callsCount: 9,
      strongCalls: 0,
    }),
  );
  await repo.save(
    KolWindowStat.create({
      caller: 'dana',
      window: '1d',
      totalX: 0.46,
      callsCount: 1,
      strongCalls: 0,
    }),
  );
  return repo;
}

describe('GET /api/kol-rankings (todo 12, failing-first)', () => {
  it('sorts perf_desc by total_x descending', async () => {
    const repo = await seed();
    const controller = new RankingsController(new GetKolRankingsUseCase(repo));
    const rows = await controller.list({ window: '30d', sort: 'perf_desc' });
    expect(rows.map((r) => r.caller)).toEqual(['bob', 'alice', 'cara']);
    expect(rows[0]).toMatchObject({
      caller: 'bob',
      window: '30d',
      totalX: 20,
      callsCount: 2,
      strongCalls: 2,
      display: '+20X',
    });
  });

  it('sorts perf_asc by total_x ascending', async () => {
    const repo = await seed();
    const controller = new RankingsController(new GetKolRankingsUseCase(repo));
    const rows = await controller.list({ window: '30d', sort: 'perf_asc' });
    expect(rows.map((r) => r.caller)).toEqual(['cara', 'alice', 'bob']);
  });

  it('sorts calls_desc by calls_count descending', async () => {
    const repo = await seed();
    const controller = new RankingsController(new GetKolRankingsUseCase(repo));
    const rows = await controller.list({ window: '30d', sort: 'calls_desc' });
    expect(rows.map((r) => r.caller)).toEqual(['cara', 'alice', 'bob']);
  });

  it('displays +% for the 1d window', async () => {
    const repo = await seed();
    const controller = new RankingsController(new GetKolRankingsUseCase(repo));
    const rows = await controller.list({ window: '1d', sort: 'perf_desc' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ caller: 'dana', display: '+46%' });
  });

  it('returns an empty list for a window with no stats', async () => {
    const repo = await seed();
    const controller = new RankingsController(new GetKolRankingsUseCase(repo));
    const rows = await controller.list({ window: '7d', sort: 'perf_desc' });
    expect(rows).toEqual([]);
  });

  it('rejects unknown window and sort values', async () => {
    const repo = await seed();
    const controller = new RankingsController(new GetKolRankingsUseCase(repo));
    await expect(
      controller.list({ window: '90d' as '30d', sort: 'perf_desc' }),
    ).rejects.toThrow();
    await expect(
      controller.list({ window: '30d', sort: 'hot' as 'perf_desc' }),
    ).rejects.toThrow();
  });
});
