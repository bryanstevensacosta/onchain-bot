import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SchedulingConfigRepository } from '@/scheduling/domain/ports/scheduling-config.repository';
import {
  isSchedulingTarget,
  type SchedulingTarget,
} from '@/scheduling/domain/scheduling-target';
import { UpdateDeliveryPolicyDto } from '../input/delivery-policy.input';
import {
  toDeliveryPolicyView,
  type DeliveryPolicyView,
} from '@/scheduling/application/mappers/scheduling.mapper';

/**
 * Canonical per-target delivery policies (R-c, R1 RESUELTA).
 *
 *  - GET   /api/scheduling/delivery-policies/:target
 *  - PATCH /api/scheduling/delivery-policies/:target (partial update)
 *
 * `:target` is `telegram | threads`; anything else fails 400. Replaces
 * the frozen `rotation-config` route (dual-served until CUT).
 */
@ApiTags('feed-publisher-scheduling')
@Controller('api/scheduling/delivery-policies')
export class DeliveryPoliciesController {
  public constructor(
    private readonly policiesRepo: SchedulingConfigRepository,
  ) {}

  @Get(':target')
  @ApiOperation({ summary: 'Delivery policy for one target' })
  @ApiResponse({ status: 200, description: 'Delivery policy' })
  @ApiResponse({ status: 400, description: 'Unknown target' })
  public async get(
    @Param('target') target: string,
  ): Promise<DeliveryPolicyView> {
    const config = await this.policiesRepo.load();
    return toDeliveryPolicyView(config, this.requireTarget(target));
  }

  @Patch(':target')
  @ApiOperation({ summary: 'Patch the delivery policy for one target' })
  @ApiResponse({ status: 200, description: 'Delivery policy updated' })
  @ApiResponse({ status: 400, description: 'Unknown target or range' })
  public async update(
    @Param('target') target: string,
    @Body() dto: UpdateDeliveryPolicyDto,
  ): Promise<DeliveryPolicyView> {
    const resolved = this.requireTarget(target);
    const current = await this.policiesRepo.load();
    const policy = current.limitsFor(resolved);
    const delayMinMs = dto.delayMinMs ?? policy.delayMinMs;
    const delayMaxMs = dto.delayMaxMs ?? policy.delayMaxMs;
    if (delayMinMs > delayMaxMs) {
      throw new BadRequestException(
        `delayMinMs must be <= delayMaxMs (min=${delayMinMs}, max=${delayMaxMs})`,
      );
    }
    const next = current.update({
      [resolved]: {
        ...(dto.delayMinMs !== undefined
          ? { delayMinMs: dto.delayMinMs }
          : {}),
        ...(dto.delayMaxMs !== undefined
          ? { delayMaxMs: dto.delayMaxMs }
          : {}),
        ...(dto.dailyCap !== undefined ? { dailyCap: dto.dailyCap } : {}),
        ...(dto.resetHour !== undefined ? { resetHour: dto.resetHour } : {}),
      },
    });
    await this.policiesRepo.save(next);
    return toDeliveryPolicyView(next, resolved);
  }

  private requireTarget(raw: string): SchedulingTarget {
    if (!isSchedulingTarget(raw)) {
      throw new BadRequestException(
        `Unknown scheduling target: ${raw} (expected telegram|threads)`,
      );
    }
    return raw;
  }
}
