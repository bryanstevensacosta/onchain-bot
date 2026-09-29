/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL rating moved to
 * apps/kol-calls/src/tracking (TrackedMention + kol_window_stats +
 * GET /api/kol-rankings). Refactor target: delete this file at the
 * central FINAL REVIEW (C4-bis.3). Rollback: backend path stays wired.
 */
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { RecomputeKolReputationUseCase } from '@/kol/reputation/application/handlers/recompute-kol-reputation.use-case';
import { KolReputationScheduler } from './kol-reputation.scheduler';

function makeKol(id: string): Kol {
  return {
    id,
    handle: `handle-${id}`,
    title: `Title ${id}`,
    isActive: true,
    lifecycleStatus: 'ACTIVE',
  } as unknown as Kol;
}

interface FakeKolRepo extends KolRepository {
  kols: Kol[];
}
function makeKolRepo(kols: Kol[]): FakeKolRepo {
  return {
    kols,
    findAll: async () => kols,
  } as unknown as FakeKolRepo;
}

interface FakeRecompute extends RecomputeKolReputationUseCase {
  calls: Array<{ kolId: string }>;
  failFor: Set<string>;
}
function makeRecompute(): FakeRecompute {
  const mock: FakeRecompute = {
    calls: [],
    failFor: new Set(),
    execute: async (input: { kolId: string }) => {
      mock.calls.push(input);
      if (mock.failFor.has(input.kolId)) {
        throw new Error(`boom for ${input.kolId}`);
      }
      return {} as never;
    },
  };
  return mock;
}
function makeConfig(schedulerEnabled: boolean): ConfigService {
  return {
    get: () => ({
      kolReputation: {
        schedulerCron: '*/15 * * * *',
        schedulerEnabled,
      },
    }),
  } as unknown as ConfigService;
}

function makeSchedulerRegistry(): SchedulerRegistry {
  return {} as unknown as SchedulerRegistry;
}

describe('KolReputationScheduler', () => {
  describe('tick', () => {
    it('iterates all KOLs and recomputes each', async () => {
      const kolRepo = makeKolRepo([makeKol('111'), makeKol('222')]);
      const recompute = makeRecompute();
      const scheduler = new KolReputationScheduler(
        kolRepo,
        recompute,
        makeSchedulerRegistry(),
        makeConfig(true),
      );

      await scheduler.tick();

      expect(recompute.calls).toEqual([{ kolId: '111' }, { kolId: '222' }]);
    });

    it('continues iterating when one KOL fails', async () => {
      const kolRepo = makeKolRepo([
        makeKol('111'),
        makeKol('222'),
        makeKol('333'),
      ]);
      const recompute = makeRecompute();
      recompute.failFor.add('222');
      const scheduler = new KolReputationScheduler(
        kolRepo,
        recompute,
        makeSchedulerRegistry(),
        makeConfig(true),
      );

      await scheduler.tick();

      expect(recompute.calls.map((c) => c.kolId)).toEqual([
        '111',
        '222',
        '333',
      ]);
    });

    it('skips the tick if previous one is still running', async () => {
      const kolRepo = makeKolRepo([makeKol('111'), makeKol('222')]);
      const recompute = makeRecompute();
      const scheduler = new KolReputationScheduler(
        kolRepo,
        recompute,
        makeSchedulerRegistry(),
        makeConfig(true),
      );

      const first = scheduler.tick();
      const second = scheduler.tick();
      await Promise.all([first, second]);

      expect(recompute.calls).toEqual([{ kolId: '111' }, { kolId: '222' }]);
    });

    it('handles empty KOL list (no recompute calls)', async () => {
      const kolRepo = makeKolRepo([]);
      const recompute = makeRecompute();
      const scheduler = new KolReputationScheduler(
        kolRepo,
        recompute,
        makeSchedulerRegistry(),
        makeConfig(true),
      );

      await scheduler.tick();

      expect(recompute.calls).toEqual([]);
    });
  });
});
