import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { ScoringThresholdEntity } from 'settings/infrastructure/persistence/typeorm/entities/scoring-threshold.entity';
import type { CreateThresholdDto } from 'settings/api/input/create-threshold.dto';
import type { UpdateThresholdDto } from 'settings/api/input/update-threshold.dto';
import { SettingsService } from 'settings/application/services/settings.service';
import { AuditService } from 'settings/application/services/audit.service';

@Controller('settings/thresholds')
export class ThresholdsController {
  public constructor(
    @InjectRepository(ScoringThresholdEntity)
    private readonly repo: Repository<ScoringThresholdEntity>,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  public async list(@Query('scope') scope?: 'token' | 'kol') {
    const where = scope ? { scope } : {};
    return this.repo.find({ where, order: { minScore: 'ASC' } });
  }

  @Post()
  public async create(@Body() dto: CreateThresholdDto, @Req() req: Request) {
    const entity = this.repo.create(dto);
    const saved = await this.repo.save(entity);
    this.settings.invalidateThresholdsCache(dto.scope);
    await this.audit.log({
      entityType: 'threshold',
      entityId: saved.id,
      action: 'CREATE',
      before: null,
      after: { ...saved },
      sourceIp: req.ip ?? null,
    });
    return saved;
  }

  @Patch(':id')
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateThresholdDto,
    @Req() req: Request,
  ) {
    const before = await this.repo.findOneByOrFail({ id });
    Object.assign(before, dto);
    const after = await this.repo.save(before);
    this.settings.invalidateThresholdsCache(before.scope);
    await this.audit.log({
      entityType: 'threshold',
      entityId: id,
      action: 'UPDATE',
      before: { ...before },
      after: { ...after },
      sourceIp: req.ip ?? null,
    });
    return after;
  }

  @Delete(':id')
  public async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    const before = await this.repo.findOneByOrFail({ id });
    await this.repo.delete(id);
    this.settings.invalidateThresholdsCache(before.scope);
    await this.audit.log({
      entityType: 'threshold',
      entityId: id,
      action: 'DELETE',
      before: { ...before },
      after: null,
      sourceIp: req.ip ?? null,
    });
    return { deleted: true };
  }
}
