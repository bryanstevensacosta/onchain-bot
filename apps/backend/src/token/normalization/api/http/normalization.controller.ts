/**
 * @deprecated Moved to apps/kol-calls/src/normalization/ (Tramo 1, todo 7 + P18 companion).
 * Normalization as mention-index now lives in kol-calls: NormalizeCallUseCase →
 * (contract, kol, messageId) index WITHOUT collapse ("one card per coin" explicitly
 * derogated per P1). This file stays wired for dual-run; it will be removed in
 * todo 16 (cutover + cleanup). Do not extend it — add normalization logic in
 * apps/kol-calls/src/normalization/ instead.
 *
 * New location: apps/kol-calls/src/normalization/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import { GetCanonicalCallUseCase } from 'token/normalization/application/handlers/get-canonical-call.use-case';
import { ListCanonicalCallsUseCase } from 'token/normalization/application/handlers/list-canonical-calls.use-case';
import type { CanonicalTokenCallView } from 'token/normalization/application/mappers/canonical-token-call.mapper';

/**
 * HTTP adapter for the normalization BC.
 *
 * Read-only — normalization is purely event-driven in v1.
 */
@Controller('token/normalization')
export class NormalizationController {
  public constructor(
    private readonly getCall: GetCanonicalCallUseCase,
    private readonly listCalls: ListCanonicalCallsUseCase,
  ) {}

  @Get('tokens/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<CanonicalTokenCallView>> {
    const parsed = limit ? Number(limit) : 10;
    return this.listCalls.execute(parsed);
  }

  @Get('tokens/:chain/:address')
  public get(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): Promise<CanonicalTokenCallView> {
    return this.getCall.execute(chain, address);
  }
}
