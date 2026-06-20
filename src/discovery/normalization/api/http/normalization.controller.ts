import { Controller, Get, Param, Query } from '@nestjs/common';
import { GetCanonicalCallUseCase } from 'discovery/normalization/application/handlers/get-canonical-call.use-case';
import { ListCanonicalCallsUseCase } from 'discovery/normalization/application/handlers/list-canonical-calls.use-case';
import type { CanonicalTokenCallView } from 'discovery/normalization/application/mappers/canonical-token-call.mapper';

/**
 * HTTP adapter for the normalization BC.
 *
 * Read-only — normalization is purely event-driven in v1.
 */
@Controller('discovery/normalization')
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
