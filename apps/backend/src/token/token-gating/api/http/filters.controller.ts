import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SettingsService } from 'settings/application/services/settings.service';
import {
  ApplyFiltersUseCase,
  FilterConfig,
} from 'token/token-gating/application/handlers/apply-filters.use-case';
import { GetFilterDecisionUseCase } from 'token/token-gating/application/handlers/get-filter-decision.use-case';
import { ListFilterDecisionsUseCase } from 'token/token-gating/application/handlers/list-filter-decisions.use-case';
import { ApplyFiltersInput } from 'token/token-gating/api/input/apply-filters.input';
import type { FilterDecisionView } from 'token/token-gating/application/mappers/filter-decision.mapper';

@Controller('token/token-gating')
export class FiltersController {
  public constructor(
    private readonly apply: ApplyFiltersUseCase,
    private readonly getOne: GetFilterDecisionUseCase,
    private readonly list: ListFilterDecisionsUseCase,
    private readonly settings: SettingsService,
  ) {}

  @Post('apply')
  public async run(
    @Body() input: ApplyFiltersInput,
  ): Promise<FilterDecisionView> {
    const dbConfig = await this.settings.getTokenGateConfig();
    const config: FilterConfig = {
      ...dbConfig,
      ...(input.config ?? {}),
    };
    return this.apply.execute({
      chain: input.chain,
      address: input.address,
      score: input.score,
      classification: input.classification,
      riskWeight: input.riskWeight,
      snapshotCompleteness: input.snapshotCompleteness,
      config,
    });
  }

  @Get('decisions/approved')
  public approved(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<FilterDecisionView>> {
    return this.list.execute('approved', limit ? Number(limit) : 20);
  }

  @Get('decisions/rejected')
  public rejected(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<FilterDecisionView>> {
    return this.list.execute('rejected', limit ? Number(limit) : 20);
  }

  @Get('decisions/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<FilterDecisionView>> {
    return this.list.execute('recent', limit ? Number(limit) : 10);
  }

  @Get('decisions/:chain/:address')
  public get(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): Promise<FilterDecisionView> {
    return this.getOne.execute(chain, address);
  }
}
