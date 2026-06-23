import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RegisterKolUseCase } from 'telegram-kol/identity/application/handlers/register-kol.use-case';
import { GetKolUseCase } from 'telegram-kol/identity/application/handlers/get-kol.use-case';
import { ListKolsUseCase } from 'telegram-kol/identity/application/handlers/list-kols.use-case';
import { SetKolLifecycleUseCase } from 'telegram-kol/identity/application/handlers/set-kol-lifecycle.use-case';
import { StartKolIngestionUseCase } from 'telegram-kol/ingestion/application/handlers/start-kol-ingestion.use-case';
import type { RegisterKolInput } from 'telegram-kol/identity/api/input/register-kol.input';
import type { KolView } from 'telegram-kol/identity/application/mappers/kol.mapper';
import type { KolLifecycleTransition } from 'telegram-kol/identity/application/handlers/set-kol-lifecycle.use-case';

/**
 * HTTP adapter for Telegram KOL ingestion management.
 * Inbound port (REST API) — exposes KOL CRUD + lifecycle use cases over HTTP.
 *
 * Note: `StartKolIngestionUseCase` lives in `telegram-kol/ingestion/` and is
 * invoked programmatically (no own controller yet) — identity/ is purely CRUD.
 *
 * Routes (Fase 1 of the kol-refactor plan):
 *   GET    /telegram-kol/identity/kols
 *   POST   /telegram-kol/identity/kols
 *   GET    /telegram-kol/identity/kols/:kolId
 *   PATCH  /telegram-kol/identity/kols/:kolId/lifecycle
 *   POST   /telegram-kol/identity/kols/:kolId/backfill
 */
@Controller('telegram-kol/identity')
export class KolController {
  constructor(
    private readonly registerKol: RegisterKolUseCase,
    private readonly getKol: GetKolUseCase,
    private readonly listKols: ListKolsUseCase,
    private readonly setLifecycle: SetKolLifecycleUseCase,
    private readonly startListening: StartKolIngestionUseCase,
  ) {}

  @Get('kols')
  public list(): Promise<ReadonlyArray<KolView>> {
    return this.listKols.execute();
  }

  @Post('kols')
  public add(@Body() input: RegisterKolInput): Promise<KolView> {
    return this.registerKol.execute(input);
  }

  @Get('kols/:kolId')
  public get(@Param('kolId') kolId: string): Promise<KolView> {
    return this.getKol.execute(kolId);
  }

  @Post('kols/:kolId/lifecycle')
  public setKolLifecycle(
    @Param('kolId') kolId: string,
    @Body() body: { status: KolLifecycleTransition },
  ): Promise<KolView> {
    return this.setLifecycle.execute({ kolId, status: body.status });
  }

  /**
   * On-demand historical backfill: fetch up to `limit` recent messages
   * from one KOL channel and ingest them through the normal pipeline.
   */
  @Post('kols/:kolId/backfill')
  public async backfill(
    @Param('kolId') kolId: string,
    @Query('limit') limit?: string,
  ): Promise<{ ingested: number; total: number }> {
    const n = Math.max(1, Math.min(100, parseInt(limit ?? '10', 10) || 10));
    return this.startListening.backfillKol(kolId, n);
  }
}
