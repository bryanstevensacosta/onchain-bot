import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DisplayMap } from '@/templates/domain/display-map.entity';
import {
  DISPLAY_PLACEHOLDER_KEYS,
  DisplayMapDuplicateError,
  DisplayMapValidationError,
} from '@/templates/domain/display-map.validators';
import { DisplayMapRepository } from '@/templates/domain/ports/display-map.repository';
import { DisplayResolverService } from '@/templates/application/display-resolver.service';
import {
  CreateDisplayMapDto,
  UpdateDisplayMapDto,
} from './dto/display-map.dto';

export interface DisplayMapView {
  readonly id: string;
  readonly placeholderKey: string;
  readonly matchValue: string;
  readonly display: string;
  readonly createdAt: Date;
}

const toView = (map: DisplayMap): DisplayMapView => ({
  id: map.id,
  placeholderKey: map.placeholderKey,
  matchValue: map.matchValue,
  display: map.display,
  createdAt: map.createdAt,
});

const isKeyError = (error: DisplayMapValidationError): boolean =>
  /placeholderKey/.test(error.message);

/**
 * Display-map catalog (`GET /api/dexter/display-maps`,
 * display-catalog rename).
 *
 * v1 sin auth como /dexter/token — read/write gestion-solo-HTTP-API sin
 * guard (mismo regimen que el lookup `/dexter/*` existente; auth llega
 * en una fase posterior, fuera del plan v1).
 *
 * Domain errors map to HTTP explicitly (never a raw 500):
 * unknown `placeholderKey` -> 400 + whitelist; empty/invalid
 * `matchValue`/`display` -> 400; duplicate pair -> 409; unknown id -> 404.
 * After every write the render cache is refreshed
 * (`DisplayResolverService.refresh()`) so `{{chainDisplay}}` renders stay
 * fresh without a reboot (full `DISPLAY_RESOLVER` binding lands in todo 13).
 */
@Controller('api/dexter/display-maps')
export class DisplayMapsController {
  public constructor(
    private readonly maps: DisplayMapRepository,
    private readonly resolver: DisplayResolverService,
  ) {}

  @Get()
  public async list(
    @Query('placeholderKey') placeholderKey?: string,
  ): Promise<readonly DisplayMapView[]> {
    if (placeholderKey !== undefined) {
      const key = placeholderKey.trim();
      if (!DISPLAY_PLACEHOLDER_KEYS.includes(key)) {
        throw new BadRequestException({
          error: `Unknown placeholderKey ${JSON.stringify(placeholderKey)}`,
          valid: [...DISPLAY_PLACEHOLDER_KEYS],
        });
      }
      return (await this.maps.findByKey(key)).map(toView);
    }
    return (await this.maps.findAll()).map(toView);
  }

  @Post()
  public async create(
    @Body() dto: CreateDisplayMapDto,
  ): Promise<DisplayMapView> {
    let map: DisplayMap;
    try {
      map = DisplayMap.create({
        placeholderKey: dto.placeholderKey,
        matchValue: dto.matchValue,
        display: dto.display,
      });
    } catch (error) {
      throw DisplayMapsController.toBadRequest(error);
    }
    try {
      const saved = await this.maps.save(map);
      await this.resolver.refresh();
      return toView(saved);
    } catch (error) {
      throw DisplayMapsController.toConflict(error);
    }
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateDisplayMapDto,
  ): Promise<DisplayMapView> {
    const existing = await this.maps.findOne(id);
    if (!existing) {
      throw new NotFoundException(`DisplayMap ${id} not found`);
    }
    try {
      if (dto.matchValue !== undefined) {
        existing.updateMatchValue(dto.matchValue);
      }
      if (dto.display !== undefined) {
        existing.updateDisplay(dto.display);
      }
    } catch (error) {
      throw DisplayMapsController.toBadRequest(error);
    }
    try {
      const saved = await this.maps.save(existing);
      await this.resolver.refresh();
      return toView(saved);
    } catch (error) {
      throw DisplayMapsController.toConflict(error);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@Param('id') id: string): Promise<void> {
    const existing = await this.maps.findOne(id);
    if (!existing) {
      throw new NotFoundException(`DisplayMap ${id} not found`);
    }
    await this.maps.delete(id);
    await this.resolver.refresh();
  }

  private static toBadRequest(error: unknown): Error {
    if (error instanceof DisplayMapValidationError) {
      if (isKeyError(error)) {
        return new BadRequestException({
          error: error.message,
          valid: [...DISPLAY_PLACEHOLDER_KEYS],
        });
      }
      return new BadRequestException({ error: error.message });
    }
    throw error;
  }

  private static toConflict(error: unknown): Error {
    if (error instanceof DisplayMapDuplicateError) {
      return new ConflictException({ error: error.message });
    }
    if (error instanceof DisplayMapValidationError) {
      return DisplayMapsController.toBadRequest(error);
    }
    throw error;
  }
}
