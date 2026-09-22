import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RegisterKolUseCase } from 'kol/identity/application/handlers/register-kol.use-case';
import { GetKolUseCase } from 'kol/identity/application/handlers/get-kol.use-case';
import { ListKolsUseCase } from 'kol/identity/application/handlers/list-kols.use-case';
import { ListActiveKolIdsUseCase } from 'kol/identity/application/handlers/list-active-kol-ids.use-case';
import { SetKolLifecycleUseCase } from 'kol/identity/application/handlers/set-kol-lifecycle.use-case';
import { KolIngestionOrchestratorUseCase } from 'kol/identity/application/handlers/kol-ingestion-orchestrator.use-case';
import type { RegisterKolInput } from 'kol/identity/api/input/register-kol.input';
import type { KolView } from 'kol/identity/application/mappers/kol.mapper';
import type { KolLifecycleTransition } from 'kol/identity/application/handlers/set-kol-lifecycle.use-case';
import { kolIdentityGone } from 'kol/identity/application/errors/kol-identity-gone.error';

/**
 * DEPRECATED (item 8, telegram-feed-unification): every route answers 501
 * with a hint to the feed replacement.
 *
 * KOL identity moved to ingestion-telegram (`telegram_feed_sources`,
 * `type='kol'`). Backend pipeline reads go through `FeedIdentityHttpClient`
 * (`GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`); the local
 * `kols` table is dropped. SINGLE deprecation code 501 everywhere (never 410).
 *
 * Constructor keeps the use-case injections (DI untouched for consumers);
 * the use cases themselves are 501 shims too, so direct DI callers fail
 * loud with the same hint instead of 500/404.
 */
@Controller('telegram-kol/identity')
export class KolController {
  constructor(
    private readonly registerKol: RegisterKolUseCase,
    private readonly getKol: GetKolUseCase,
    private readonly listKols: ListKolsUseCase,
    private readonly listActiveKolIds: ListActiveKolIdsUseCase,
    private readonly setLifecycle: SetKolLifecycleUseCase,
    private readonly startListening: KolIngestionOrchestratorUseCase,
  ) {
    void this.registerKol;
    void this.getKol;
    void this.listKols;
    void this.listActiveKolIds;
    void this.setLifecycle;
    void this.startListening;
  }

  @Get('kols')
  public list(): Promise<ReadonlyArray<KolView>> {
    throw kolIdentityGone('GET /telegram-kol/identity/kols');
  }

  /**
   * Get active KOL IDs (for ingestion-telegram subscription)
   * Returns only the kolId strings of KOLs with isActive=true and lifecycleStatus=ACTIVE
   */
  @Get('kols/active/ids')
  public listActiveIds(): Promise<ReadonlyArray<string>> {
    throw kolIdentityGone('GET /telegram-kol/identity/kols/active/ids');
  }

  @Post('kols')
  public add(@Body() _input: RegisterKolInput): Promise<KolView> {
    throw kolIdentityGone('POST /telegram-kol/identity/kols');
  }

  @Get('kols/:kolId')
  public get(@Param('kolId') _kolId: string): Promise<KolView> {
    throw kolIdentityGone('GET /telegram-kol/identity/kols/:kolId');
  }

  @Post('kols/:kolId/lifecycle')
  public setKolLifecycle(
    @Param('kolId') _kolId: string,
    @Body() _body: { status: KolLifecycleTransition },
  ): Promise<KolView> {
    throw kolIdentityGone('POST /telegram-kol/identity/kols/:kolId/lifecycle');
  }

  /**
   * On-demand historical backfill: fetch up to `limit` recent messages
   * from one KOL channel and ingest them through the normal pipeline.
   */
  @Post('kols/:kolId/backfill')
  public backfill(
    @Param('kolId') _kolId: string,
    @Query('limit') _limit?: string,
  ): Promise<{ ingested: number; total: number }> {
    throw kolIdentityGone('POST /telegram-kol/identity/kols/:kolId/backfill');
  }
}
