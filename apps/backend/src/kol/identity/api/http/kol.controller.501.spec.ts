import { HttpException } from '@nestjs/common';
import { KolController } from './kol.controller';
import { RegisterKolUseCase } from 'kol/identity/application/handlers/register-kol.use-case';
import { GetKolUseCase } from 'kol/identity/application/handlers/get-kol.use-case';
import { ListKolsUseCase } from 'kol/identity/application/handlers/list-kols.use-case';
import { ListActiveKolIdsUseCase } from 'kol/identity/application/handlers/list-active-kol-ids.use-case';
import { SetKolLifecycleUseCase } from 'kol/identity/application/handlers/set-kol-lifecycle.use-case';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';

/**
 * Item 8 (telegram-feed-unification): every `KolController` route answers
 * 501 with a hint to `/api/feed/sources?type=kol` (SINGLE code 501, never 410).
 *
 * This is the HTTP-level 501 proof (curl equivalent against a dev boot is
 * recorded in `.omo/evidence/task-8-telegram-feed-unification.txt`).
 */
describe('KolController (deprecated → 501)', () => {
  let controller: KolController;

  beforeEach(() => {
    controller = new KolController(
      new RegisterKolUseCase(),
      new GetKolUseCase(),
      new ListKolsUseCase(),
      new ListActiveKolIdsUseCase(),
      new SetKolLifecycleUseCase(),
      {} as KolIngestionOrchestratorUseCase,
    );
  });

  function expect501(fn: () => unknown, route: string): void {
    let err: unknown;
    try {
      fn();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpException);
    const http = err as HttpException;
    expect(http.getStatus()).toBe(501);
    const body = JSON.stringify(http.getResponse());
    expect(body).toContain('/api/feed/sources?type=kol');
    expect(body).toContain(route);
  }

  it('GET /kols → 501 with feed hint', () => {
    expect501(() => controller.list(), 'GET /telegram-kol/identity/kols');
  });

  it('GET /kols/active/ids → 501 with feed hint', () => {
    expect501(
      () => controller.listActiveIds(),
      'GET /telegram-kol/identity/kols/active/ids',
    );
  });

  it('POST /kols → 501 with feed hint', () => {
    expect501(
      () => controller.add({ kolId: '-100123' }),
      'POST /telegram-kol/identity/kols',
    );
  });

  it('GET /kols/:kolId → 501 with feed hint', () => {
    expect501(
      () => controller.get('-100123'),
      'GET /telegram-kol/identity/kols/:kolId',
    );
  });

  it('POST /kols/:kolId/lifecycle → 501 with feed hint', () => {
    expect501(
      () => controller.setKolLifecycle('-100123', { status: 'DORMANT' }),
      'POST /telegram-kol/identity/kols/:kolId/lifecycle',
    );
  });

  it('POST /kols/:kolId/backfill → 501 with feed hint', () => {
    expect501(
      () => controller.backfill('-100123', '10'),
      'POST /telegram-kol/identity/kols/:kolId/backfill',
    );
  });

  it('use-case shims throw 501 too (direct DI callers fail loud)', async () => {
    await expect(new ListKolsUseCase().execute()).rejects.toMatchObject({
      status: 501,
    });
    await expect(
      new RegisterKolUseCase().execute({ kolId: '-100123' }),
    ).rejects.toMatchObject({ status: 501 });
    await expect(new GetKolUseCase().execute('-100123')).rejects.toMatchObject({
      status: 501,
    });
    await expect(
      new SetKolLifecycleUseCase().execute({
        kolId: '-100123',
        status: 'ACTIVE',
      }),
    ).rejects.toMatchObject({ status: 501 });
    await expect(new ListActiveKolIdsUseCase().execute()).rejects.toMatchObject(
      { status: 501 },
    );
  });
});
