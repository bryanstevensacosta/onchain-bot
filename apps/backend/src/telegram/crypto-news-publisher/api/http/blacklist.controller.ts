import {
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
} from '@nestjs/common';
import { BlacklistPhraseRepository } from 'telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository';
import { BlacklistPhrase } from 'telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity';
import type { MatchMode } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

export interface BlacklistPhraseView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly matchMode: MatchMode;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly createdAt: string;
}

interface CreateBlacklistDto {
  phrase: string;
  caseSensitive?: boolean;
  matchMode?: MatchMode;
  enabled?: boolean;
  sourceChannelIds?: string[];
  andGroupId?: string | null;
  requireMedia?: boolean;
}

interface UpdateBlacklistDto {
  phrase?: string;
  caseSensitive?: boolean;
  matchMode?: MatchMode;
  enabled?: boolean;
  sourceChannelIds?: string[];
  andGroupId?: string | null;
  requireMedia?: boolean;
}

/**
 * REST API for crypto-news-publisher blacklist phrases.
 *
 * Endpoints (all under `/crypto-news-publisher/blacklist`):
 *  - GET    /          List all blacklist phrases
 *  - GET    /:id       Get one blacklist phrase
 *  - POST   /          Create a new blacklist phrase
 *  - PATCH  /:id       Update a blacklist phrase (partial)
 *  - DELETE /:id       Remove a blacklist phrase
 */
@Controller('crypto-news-publisher/blacklist')
export class BlacklistController {
  public constructor(
    private readonly blacklistRepo: BlacklistPhraseRepository,
  ) {}

  @Get()
  public async list(): Promise<ReadonlyArray<BlacklistPhraseView>> {
    const all = await this.blacklistRepo.findAll();
    return all.map(BlacklistController.toView);
  }

  @Get(':id')
  public async getOne(@Param('id') id: string): Promise<BlacklistPhraseView> {
    const all = await this.blacklistRepo.findAll();
    const phrase = all.find((p) => p.id === id);
    if (!phrase) {
      throw new NotFoundException(`Blacklist phrase ${id} not found`);
    }
    return BlacklistController.toView(phrase);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async create(
    @Body() dto: CreateBlacklistDto,
  ): Promise<BlacklistPhraseView> {
    const trimmed = dto.phrase.trim();
    const existing = await this.blacklistRepo.findAll();
    const dup = existing.find(
      (k) =>
        k.phrase.toLowerCase() === trimmed.toLowerCase() &&
        k.andGroupId === (dto.andGroupId ?? null),
    );
    if (dup) {
      throw new ConflictException(
        `Blacklist phrase "${dto.phrase}" already exists`,
      );
    }

    const phrase = BlacklistPhrase.create({
      phrase: dto.phrase,
      caseSensitive: dto.caseSensitive,
      matchMode: dto.matchMode ?? 'exact',
      enabled: dto.enabled,
      sourceChannelIds: dto.sourceChannelIds ?? [],
      andGroupId: dto.andGroupId ?? null,
      requireMedia: dto.requireMedia ?? false,
    });
    await this.blacklistRepo.save(phrase);
    return BlacklistController.toView(phrase);
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateBlacklistDto,
  ): Promise<BlacklistPhraseView> {
    const all = await this.blacklistRepo.findAll();
    const existing = all.find((p) => p.id === id);
    if (!existing) {
      throw new NotFoundException(`Blacklist phrase ${id} not found`);
    }

    const nextPhrase = dto.phrase !== undefined ? dto.phrase : existing.phrase;
    const nextCaseSensitive =
      dto.caseSensitive !== undefined
        ? dto.caseSensitive
        : existing.caseSensitive;
    const nextMatchMode =
      dto.matchMode !== undefined ? dto.matchMode : existing.matchMode;
    let nextEnabled = existing.enabled;
    if (dto.enabled === true) {
      nextEnabled = true;
    } else if (dto.enabled === false) {
      nextEnabled = false;
    }
    const nextSourceChannelIds =
      dto.sourceChannelIds !== undefined
        ? dto.sourceChannelIds
        : existing.sourceChannelIds;
    const nextAndGroupId =
      dto.andGroupId !== undefined ? dto.andGroupId : existing.andGroupId;
    const nextRequireMedia =
      dto.requireMedia !== undefined ? dto.requireMedia : existing.requireMedia;

    const updated = BlacklistPhrase.reconstitute({
      id: existing.id,
      phrase: nextPhrase,
      caseSensitive: nextCaseSensitive,
      matchMode: nextMatchMode,
      sourceChannelIds: nextSourceChannelIds,
      enabled: nextEnabled,
      andGroupId: nextAndGroupId,
      requireMedia: nextRequireMedia,
      createdAt: existing.createdAt,
    });

    await this.blacklistRepo.save(updated);
    return BlacklistController.toView(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@Param('id') id: string): Promise<void> {
    await this.blacklistRepo.delete(id);
  }

  private static readonly toView = (
    phrase: BlacklistPhrase,
  ): BlacklistPhraseView => ({
    id: phrase.id,
    phrase: phrase.phrase,
    caseSensitive: phrase.caseSensitive,
    matchMode: phrase.matchMode,
    sourceChannelIds: phrase.sourceChannelIds,
    enabled: phrase.enabled,
    andGroupId: phrase.andGroupId,
    requireMedia: phrase.requireMedia,
    createdAt: phrase.createdAt.toISOString(),
  });
}
