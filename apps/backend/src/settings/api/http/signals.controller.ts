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
import { SignalEntity } from 'settings/infrastructure/persistence/typeorm/entities/signal.entity';
import type { CreateSignalDto } from 'settings/api/input/create-signal.dto';
import type { UpdateSignalDto } from 'settings/api/input/update-signal.dto';
import { SettingsService } from 'settings/application/services/settings.service';
import { AuditService } from 'settings/application/services/audit.service';

@Controller('settings/signals')
export class SignalsController {
  public constructor(
    @InjectRepository(SignalEntity)
    private readonly repo: Repository<SignalEntity>,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  public async list(@Query('appliesTo') appliesTo?: 'token' | 'kol') {
    const where = appliesTo ? { appliesTo } : {};
    return this.repo.find({ where, order: { code: 'ASC' } });
  }

  @Post()
  public async create(@Body() dto: CreateSignalDto, @Req() req: Request) {
    const entity = this.repo.create(dto);
    const saved = await this.repo.save(entity);
    this.settings.invalidateSignalsCache(dto.appliesTo);
    await this.audit.log({
      entityType: 'signal',
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
    @Body() dto: UpdateSignalDto,
    @Req() req: Request,
  ) {
    const before = await this.repo.findOneByOrFail({ id });
    Object.assign(before, dto);
    const after = await this.repo.save(before);
    this.settings.invalidateSignalsCache(before.appliesTo);
    await this.audit.log({
      entityType: 'signal',
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
    this.settings.invalidateSignalsCache(before.appliesTo);
    await this.audit.log({
      entityType: 'signal',
      entityId: id,
      action: 'DELETE',
      before: { ...before },
      after: null,
      sourceIp: req.ip ?? null,
    });
    return { deleted: true };
  }
}
