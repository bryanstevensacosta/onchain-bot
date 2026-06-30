import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
} from '@nestjs/common';
import { AchievementThresholdRepository } from '../../application/ports/achievement-threshold.repository';
import { LiveAchievementScheduler } from '../../infrastructure/scheduling/live-achievement.scheduler';

@Controller('achievements')
export class AchievementController {
  constructor(
    private readonly thresholds: AchievementThresholdRepository,
    private readonly scheduler: LiveAchievementScheduler,
  ) {}

  @Get('thresholds')
  async listThresholds() {
    return this.thresholds.findAll();
  }

  @Put('thresholds')
  async replaceThresholds(@Body() body: { multiples: number[] }) {
    await this.thresholds.replaceAll(
      (body.multiples ?? []).map((m) => ({ multiple: m })),
    );
    return this.thresholds.findAll();
  }

  @Post('thresholds')
  async addThreshold(@Body() body: { multiple: number }) {
    return this.thresholds.save({ multiple: body.multiple });
  }

  @Delete('thresholds/:multiple')
  async removeThreshold(@Param('multiple') multiple: string) {
    const existing = await this.thresholds.findByMultiple(parseFloat(multiple));
    if (!existing) return { removed: false };
    return { removed: true };
  }

  @Post('admin/tick')
  async tick() {
    await this.scheduler.tick();
    return { ok: true };
  }
}
