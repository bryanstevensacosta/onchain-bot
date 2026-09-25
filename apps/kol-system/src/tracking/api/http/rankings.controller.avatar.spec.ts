import { RankingsController } from './rankings.controller';
import { GetKolRankingsUseCase } from '../../application/use-cases/get-kol-rankings.use-case';
import { KolWindowStatRepository } from '../../application/ports/kol-window-stat.repository';
import { InMemoryKolWindowStatRepository } from '../../infrastructure/repositories/in-memory-kol-window-stat.repository';
import { KolWindowStat } from '../../domain/entities/kol-window-stat.entity';

function makeUseCase(): {
  useCase: GetKolRankingsUseCase;
  repo: KolWindowStatRepository;
} {
  const repo = new InMemoryKolWindowStatRepository();
  return { useCase: new GetKolRankingsUseCase(repo), repo };
}

describe('RankingsController avatarUrl (P19 consumer)', () => {
  it('attaches avatarUrl from the resolver with placeholder fallback', async () => {
    const { useCase, repo } = makeUseCase();
    await repo.save(
      KolWindowStat.create({
        caller: '-1001',
        window: '30d',
        totalX: 12,
        callsCount: 3,
        strongCalls: 1,
      }),
    );
    const resolver = {
      resolveMany: async (callers: string[]) =>
        Object.fromEntries(
          callers.map((caller) => [caller, `/api/kol-avatar/${caller}`]),
        ),
    };
    const controller = new RankingsController(useCase, resolver as never);
    const rows = await controller.list({ window: '30d', sort: 'perf_desc' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      caller: '-1001',
      avatarUrl: '/api/kol-avatar/-1001',
    });
  });

  it('falls back to null avatarUrl without a resolver (dashboard placeholder)', async () => {
    const { useCase, repo } = makeUseCase();
    await repo.save(
      KolWindowStat.create({
        caller: '-1002',
        window: '30d',
        totalX: 5,
        callsCount: 1,
        strongCalls: 0,
      }),
    );
    const controller = new RankingsController(useCase);
    const rows = await controller.list({ window: '30d', sort: 'perf_desc' });
    expect(rows[0]).toMatchObject({ caller: '-1002', avatarUrl: null });
  });
});
