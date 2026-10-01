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
import { EmojiMap } from '@/templates/domain/emoji-map.entity';
import {
  EMOJI_PLACEHOLDER_KEYS,
  EmojiMapDuplicateError,
  EmojiMapValidationError,
} from '@/templates/domain/emoji-map.validators';
import { EmojiMapRepository } from '@/templates/domain/ports/emoji-map.repository';
import { EmojiResolverService } from '@/templates/application/emoji-resolver.service';
import {
  CreateEmojiMapDto,
  UpdateEmojiMapDto,
} from './dto/emoji-map.dto';

export interface EmojiMapView {
  readonly id: string;
  readonly placeholderKey: string;
  readonly matchValue: string;
  readonly emoji: string;
  readonly createdAt: Date;
}

const toView = (map: EmojiMap): EmojiMapView => ({
  id: map.id,
  placeholderKey: map.placeholderKey,
  matchValue: map.matchValue,
  emoji: map.emoji,
  createdAt: map.createdAt,
});

const isKeyError = (error: EmojiMapValidationError): boolean =>
  /placeholderKey/.test(error.message);

/**
 * Emoji-map catalog (`GET /api/dexter/emoji-maps`).
 *
 * v1 sin auth como /dexter/token — read/write gestion-solo-HTTP-API sin
 * guard (mismo regimen que el lookup `/dexter/*` existente; auth llega
 * en una fase posterior, fuera del plan v1).
 *
 * Domain errors map to HTTP explicitly (never a raw 500):
 * unknown `placeholderKey` -> 400 + whitelist; empty/invalid
 * `matchValue`/`emoji` -> 400; duplicate pair -> 409; unknown id -> 404.
 * After every write the render cache is refreshed
 * (`EmojiResolverService.refresh()`) so `{{chainEmoji}}` renders stay
 * fresh without a reboot (full `EMOJI_RESOLVER` binding lands in todo 13).
 */
@Controller('api/dexter/emoji-maps')
export class EmojiMapsController {
  public constructor(
    private readonly maps: EmojiMapRepository,
    private readonly resolver: EmojiResolverService,
  ) {}

  @Get()
  public async list(
    @Query('placeholderKey') placeholderKey?: string,
  ): Promise<readonly EmojiMapView[]> {
    if (placeholderKey !== undefined) {
      const key = placeholderKey.trim();
      if (
        !(EMOJI_PLACEHOLDER_KEYS as readonly string[]).includes(key)
      ) {
        throw new BadRequestException({
          error: `Unknown placeholderKey ${JSON.stringify(placeholderKey)}`,
          valid: [...EMOJI_PLACEHOLDER_KEYS],
        });
      }
      return (await this.maps.findByKey(key)).map(toView);
    }
    return (await this.maps.findAll()).map(toView);
  }

  @Post()
  public async create(
    @Body() dto: CreateEmojiMapDto,
  ): Promise<EmojiMapView> {
    let map: EmojiMap;
    try {
      map = EmojiMap.create({
        placeholderKey: dto.placeholderKey,
        matchValue: dto.matchValue,
        emoji: dto.emoji,
      });
    } catch (error) {
      throw EmojiMapsController.toBadRequest(error);
    }
    try {
      const saved = await this.maps.save(map);
      await this.resolver.refresh();
      return toView(saved);
    } catch (error) {
      throw EmojiMapsController.toConflict(error);
    }
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateEmojiMapDto,
  ): Promise<EmojiMapView> {
    const existing = await this.maps.findOne(id);
    if (!existing) {
      throw new NotFoundException(`EmojiMap ${id} not found`);
    }
    try {
      if (dto.matchValue !== undefined) {
        existing.updateMatchValue(dto.matchValue);
      }
      if (dto.emoji !== undefined) {
        existing.updateEmoji(dto.emoji);
      }
    } catch (error) {
      throw EmojiMapsController.toBadRequest(error);
    }
    try {
      const saved = await this.maps.save(existing);
      await this.resolver.refresh();
      return toView(saved);
    } catch (error) {
      throw EmojiMapsController.toConflict(error);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@Param('id') id: string): Promise<void> {
    const existing = await this.maps.findOne(id);
    if (!existing) {
      throw new NotFoundException(`EmojiMap ${id} not found`);
    }
    await this.maps.delete(id);
    await this.resolver.refresh();
  }

  private static toBadRequest(error: unknown): Error {
    if (error instanceof EmojiMapValidationError) {
      if (isKeyError(error)) {
        return new BadRequestException({
          error: error.message,
          valid: [...EMOJI_PLACEHOLDER_KEYS],
        });
      }
      return new BadRequestException({ error: error.message });
    }
    throw error;
  }

  private static toConflict(error: unknown): Error {
    if (error instanceof EmojiMapDuplicateError) {
      return new ConflictException({ error: error.message });
    }
    if (error instanceof EmojiMapValidationError) {
      return EmojiMapsController.toBadRequest(error);
    }
    throw error;
  }
}
