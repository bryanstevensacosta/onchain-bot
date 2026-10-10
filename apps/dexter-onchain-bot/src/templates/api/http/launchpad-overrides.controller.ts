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
  Post,
  Query,
} from '@nestjs/common';
import { LaunchpadOverride } from '@/templates/domain/launchpad-override.entity';
import {
  KNOWN_LAUNCHPAD_IDS,
  LaunchpadOverrideDuplicateError,
  LaunchpadOverrideValidationError,
  normalizeMint,
} from '@/templates/domain/launchpad-override.validators';
import { LaunchpadOverrideRepository } from '@/templates/domain/ports/launchpad-override.repository';
import { CreateLaunchpadOverrideDto } from './dto/launchpad-override.dto';

export interface LaunchpadOverrideView {
  readonly id: string;
  readonly mint: string;
  readonly launchpadId: string;
  readonly note: string | null;
  readonly createdAt: Date;
}

const toView = (row: LaunchpadOverride): LaunchpadOverrideView => ({
  id: row.id,
  mint: row.mint,
  launchpadId: row.launchpadId,
  note: row.note,
  createdAt: row.createdAt,
});

const isLaunchpadIdError = (error: LaunchpadOverrideValidationError): boolean =>
  /launchpad_id/.test(error.message);

/**
 * Curated mint→launchpad overrides (`GET/POST
 * /api/dexter/launchpad-overrides`, row lookup `GET /:id`, `DELETE
 * /:id`).
 *
 * Mirrors the `DisplayMapsController` CRUD pattern
 * (`display-maps.controller.ts:63`): same v1-no-auth HTTP-API regime,
 * same domain-error→HTTP mapping (unknown `launchpadId` → 400 +
 * whitelist; malformed `mint` → 400; duplicate mint → 409; unknown
 * id → 404).
 *
 * DELTAS from the mirrored pattern (deliberate, documented):
 * - NO `PATCH` endpoint — curated rows are delete+recreate (an edit
 *   is a new curation decision; the audit trail stays append-only).
 * - ADDED `GET /:id` row lookup (DisplayMaps has list/query only).
 * - NO resolver refresh on write — overrides are read live by the
 *   scan pipeline per resolution (no cache to warm, no reboot).
 */
@Controller('api/dexter/launchpad-overrides')
export class LaunchpadOverridesController {
  public constructor(private readonly overrides: LaunchpadOverrideRepository) {}

  @Get()
  public async list(
    @Query('mint') mint?: string,
  ): Promise<readonly LaunchpadOverrideView[]> {
    if (mint !== undefined) {
      let normalized: string;
      try {
        normalized = normalizeMint(mint);
      } catch (error) {
        throw LaunchpadOverridesController.toBadRequest(error);
      }
      const row = await this.overrides.findByMint(normalized);
      return row ? [toView(row)] : [];
    }
    return (await this.overrides.findAll()).map(toView);
  }

  @Get(':id')
  public async getOne(@Param('id') id: string): Promise<LaunchpadOverrideView> {
    const row = await this.overrides.findOne(id);
    if (!row) {
      throw new NotFoundException(`LaunchpadOverride ${id} not found`);
    }
    return toView(row);
  }

  @Post()
  public async create(
    @Body() dto: CreateLaunchpadOverrideDto,
  ): Promise<LaunchpadOverrideView> {
    let row: LaunchpadOverride;
    try {
      row = LaunchpadOverride.create({
        mint: dto.mint,
        launchpadId: dto.launchpadId,
        note: dto.note,
      });
    } catch (error) {
      throw LaunchpadOverridesController.toBadRequest(error);
    }
    try {
      return toView(await this.overrides.save(row));
    } catch (error) {
      throw LaunchpadOverridesController.toConflict(error);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@Param('id') id: string): Promise<void> {
    const existing = await this.overrides.findOne(id);
    if (!existing) {
      throw new NotFoundException(`LaunchpadOverride ${id} not found`);
    }
    await this.overrides.delete(id);
  }

  private static toBadRequest(error: unknown): Error {
    if (error instanceof LaunchpadOverrideValidationError) {
      if (isLaunchpadIdError(error)) {
        return new BadRequestException({
          error: error.message,
          valid: [...KNOWN_LAUNCHPAD_IDS],
        });
      }
      return new BadRequestException({ error: error.message });
    }
    throw error;
  }

  private static toConflict(error: unknown): Error {
    if (error instanceof LaunchpadOverrideDuplicateError) {
      return new ConflictException({ error: error.message });
    }
    if (error instanceof LaunchpadOverrideValidationError) {
      return LaunchpadOverridesController.toBadRequest(error);
    }
    throw error;
  }
}
