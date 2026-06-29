import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RegisterKolUseCase } from 'kol/identity/application/handlers/register-kol.use-case';
import { GetKolUseCase } from 'kol/identity/application/handlers/get-kol.use-case';
import { ListKolsUseCase } from 'kol/identity/application/handlers/list-kols.use-case';
import { SetKolLifecycleUseCase } from 'kol/identity/application/handlers/set-kol-lifecycle.use-case';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';
import type { RegisterKolInput } from 'kol/identity/api/input/register-kol.input';
import type { KolView } from 'kol/identity/application/mappers/kol.mapper';
import type { KolLifecycleTransition } from 'kol/identity/application/handlers/set-kol-lifecycle.use-case';

/**
 * HTTP adapter for Telegram KOL ingestion management.
 * Inbound port (REST API) — exposes KOL CRUD + lifecycle use cases over HTTP.
 *
 * The ingestion orchestrator is provided by `TelegramIngestionModule` (global).
 *
 * Routes (Fase 1 of the kol-refactor plan):
 *   GET    /kol/identity/kols
 *   POST   /kol/identity/kols
 *   GET    /kol/identity/kols/:kolId
 *   PATCH  /kol/identity/kols/:kolId/lifecycle
 *   POST   /kol/identity/kols/:kolId/backfill
 */
@Controller('telegram-kol/identity')
export class KolController {
  constructor(
    private readonly registerKol: RegisterKolUseCase,
    private readonly getKol: GetKolUseCase,
    private readonly listKols: ListKolsUseCase,
    private readonly setLifecycle: SetKolLifecycleUseCase,
    private readonly startListening: KolIngestionOrchestratorUseCase,
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
