import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { SettingsPresetsService } from 'settings/application/services/settings-presets.service';
import type { CreatePresetDto } from 'settings/api/input/create-preset.dto';
import type { UpdatePresetDto } from 'settings/api/input/update-preset.dto';

@Controller('settings/presets')
export class SettingsPresetsController {
  public constructor(private readonly presetsService: SettingsPresetsService) {}

  @Get()
  public async findAll() {
    return this.presetsService.findAll();
  }

  @Get('active')
  public async getActive() {
    return this.presetsService.getActive();
  }

  @Get(':id')
  public async findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.presetsService.findById(id);
  }

  @Post()
  @HttpCode(201)
  public async create(@Body() input: CreatePresetDto, @Req() req: Request) {
    return this.presetsService.create(input, req.ip ?? null);
  }

  @Patch(':id')
  public async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdatePresetDto,
  ) {
    return this.presetsService.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  public async delete(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.presetsService.delete(id);
  }

  @Post(':id/apply')
  @HttpCode(200)
  public async apply(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.presetsService.applyPreset(id, req.ip ?? null);
  }
}
