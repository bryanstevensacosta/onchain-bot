import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SettingsService } from 'settings/application/services/settings.service';
import {
  ApplyVipCallApprovalUseCase,
  FilterConfig,
} from 'token/vip-call-approval/application/handlers/apply-vip-call-approval.use-case';
import { GetVipCallApprovalDecisionUseCase } from 'token/vip-call-approval/application/handlers/get-vip-call-approval-decision.use-case';
import { ListVipCallApprovalDecisionsUseCase } from 'token/vip-call-approval/application/handlers/list-vip-call-approval-decisions.use-case';
import { ApplyFiltersInput } from 'token/vip-call-approval/api/input/apply-vip-call-approval.input';
import type { VipCallApprovalDecisionView } from 'token/vip-call-approval/application/mappers/vip-call-approval-decision.mapper';

@Controller('token/vip-call-approval')
export class VipCallApprovalController {
  public constructor(
    private readonly apply: ApplyVipCallApprovalUseCase,
    private readonly getOne: GetVipCallApprovalDecisionUseCase,
    private readonly list: ListVipCallApprovalDecisionsUseCase,
    private readonly settings: SettingsService,
  ) {}

  @Post('apply')
  public async run(
    @Body() input: ApplyFiltersInput,
  ): Promise<VipCallApprovalDecisionView> {
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
  ): Promise<ReadonlyArray<VipCallApprovalDecisionView>> {
    return this.list.execute('approved', limit ? Number(limit) : 20);
  }

  @Get('decisions/rejected')
  public rejected(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<VipCallApprovalDecisionView>> {
    return this.list.execute('rejected', limit ? Number(limit) : 20);
  }

  @Get('decisions/recent')
  public recent(
    @Query('limit') limit?: string,
  ): Promise<ReadonlyArray<VipCallApprovalDecisionView>> {
    return this.list.execute('recent', limit ? Number(limit) : 10);
  }

  @Get('decisions/:chain/:address')
  public get(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): Promise<VipCallApprovalDecisionView> {
    return this.getOne.execute(chain, address);
  }
}
