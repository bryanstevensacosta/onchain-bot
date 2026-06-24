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
import { SettingsFilterEntity } from 'settings/infrastructure/persistence/typeorm/entities/settings-filter.entity';
import type { CreateFilterDto } from 'settings/api/input/create-filter.dto';
import type { UpdateFilterDto } from 'settings/api/input/update-filter.dto';
import { SettingsService } from 'settings/application/services/settings.service';
import { AuditService } from 'settings/application/services/audit.service';

@Controller('settings/filters')
export class FiltersController {
  public constructor(
    @InjectRepository(SettingsFilterEntity)
    private readonly repo: Repository<SettingsFilterEntity>,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  public async list(
    @Query('type') type?: string,
    @Query('scope') scope?: 'token' | 'kol' | 'all' | 'global',
  ) {
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (scope) where.scope = scope;
    return this.repo.find({ where, order: { type: 'ASC', value: 'ASC' } });
  }

  @Post()
  public async create(@Body() dto: CreateFilterDto, @Req() req: Request) {
    const entity = this.repo.create(dto);
    const saved = await this.repo.save(entity);
    this.settings.invalidateFiltersCache(dto.type);
    await this.audit.log({
      entityType: 'filter',
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
    @Body() dto: UpdateFilterDto,
    @Req() req: Request,
  ) {
    const before = await this.repo.findOneByOrFail({ id });
    Object.assign(before, dto);
    const after = await this.repo.save(before);
    this.settings.invalidateFiltersCache(before.type);
    await this.audit.log({
      entityType: 'filter',
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
    this.settings.invalidateFiltersCache(before.type);
    await this.audit.log({
      entityType: 'filter',
      entityId: id,
      action: 'DELETE',
      before: { ...before },
      after: null,
      sourceIp: req.ip ?? null,
    });
    return { deleted: true };
  }
}
