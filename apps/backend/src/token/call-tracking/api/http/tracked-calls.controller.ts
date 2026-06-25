import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CanRepublishTokenUseCase } from 'token/call-tracking/application/handlers/can-republish-token.use-case';
import { ListTrackedCallsUseCase } from 'token/call-tracking/application/handlers/list-tracked-calls.use-case';
import { GetTrackedCallUseCase } from 'token/call-tracking/application/handlers/get-tracked-call.use-case';
import { TrackedCallMapper } from 'token/call-tracking/application/mappers/tracked-call.mapper';
import {
  GateAllowBodyDto,
  ListTrackedCallsQueryDto,
} from 'token/call-tracking/api/input/tracked-calls.input';

@Controller('call-tracking')
export class TrackedCallsController {
  constructor(
    private readonly listUseCase: ListTrackedCallsUseCase,
    private readonly getUseCase: GetTrackedCallUseCase,
    private readonly gateUseCase: CanRepublishTokenUseCase,
  ) {}

  @Get('tracked')
  async list(@Query() query: ListTrackedCallsQueryDto) {
    const records = await this.listUseCase.execute({
      ...(query.min_milestone !== undefined && {
        minMilestone: query.min_milestone,
      }),
      ...(query.max_price_drop !== undefined && {
        maxPriceDrop: query.max_price_drop,
      }),
      ...(query.has_milestones !== undefined && {
        hasMilestones: query.has_milestones,
      }),
      ...(query.limit !== undefined && { limit: query.limit }),
    });
    return records.map((r) => TrackedCallMapper.toView(r));
  }

  @Get('tracked/:chain/:address')
  async get(@Param('chain') chain: string, @Param('address') address: string) {
    const record = await this.getUseCase.execute(chain, address);
    if (!record) {
      throw new NotFoundException(`No tracked call for ${chain}:${address}`);
    }
    return TrackedCallMapper.toView(record);
  }

  @Post('gate-allow')
  async gateAllow(@Body() body: GateAllowBodyDto) {
    return this.gateUseCase.execute({
      chain: body.chain,
      address: body.address,
    });
  }
}
