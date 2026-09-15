import {
  Body,
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
import { ThreadsBlacklistPhraseRepository } from 'threads/publisher/application/ports/threads-blacklist-phrase.repository';
import { ThreadsBlacklistPhrase } from 'threads/publisher/domain/entities/threads-blacklist-phrase.entity';
import type { ThreadsMatchMode } from 'threads/publisher/domain/entities/threads-keyword.entity';
import { ThreadsPhraseRegistryService } from 'threads/publisher/application/services/threads-phrase-registry.service';

export interface ThreadsBlacklistPhraseView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly matchMode: ThreadsMatchMode;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly createdAt: string;
}

interface CreateThreadsBlacklistDto {
  phrase: string;
  caseSensitive?: boolean;
  matchMode?: ThreadsMatchMode;
  enabled?: boolean;
  sourceChannelIds?: string[];
  andGroupId?: string | null;
  requireMedia?: boolean;
}

interface UpdateThreadsBlacklistDto {
  phrase?: string;
  caseSensitive?: boolean;
  matchMode?: ThreadsMatchMode;
  enabled?: boolean;
  sourceChannelIds?: string[];
  andGroupId?: string | null;
  requireMedia?: boolean;
}

interface CreateThreadsBlacklistBatchDto {
  phrases: Array<{
    phrase: string;
    caseSensitive?: boolean;
    matchMode?: ThreadsMatchMode;
    enabled?: boolean;
    sourceChannelIds?: string[];
    requireMedia?: boolean;
  }>;
}

/**
 * REST API for threads-publisher blacklist phrases.
 *
 * Threads-typed mirror of the crypto-news `BlacklistController`
 * (`telegram/crypto-news-publisher/api/http/blacklist.controller.ts`).
 *
 * Endpoints (all under `/threads-publisher/blacklist`):
 *  - GET    /          List all blacklist phrases
 *  - GET    /:id       Get one blacklist phrase
 *  - POST   /          Create a new blacklist phrase
 *  - POST   /batch     Create an AND-group of blacklist phrases in one call
 *  - PATCH  /:id       Update a blacklist phrase (partial)
 *  - DELETE /:id       Remove a blacklist phrase
 */
@Controller('threads-publisher/blacklist')
export class ThreadsBlacklistController {
  public constructor(
    private readonly blacklistRepo: ThreadsBlacklistPhraseRepository,
    private readonly phraseRegistry: ThreadsPhraseRegistryService,
  ) {}

  @Get()
  public async list(): Promise<ReadonlyArray<ThreadsBlacklistPhraseView>> {
    const all = await this.blacklistRepo.findAll();
    return all.map(ThreadsBlacklistController.toView);
  }

  @Get(':id')
  public async getOne(
    @Param('id') id: string,
  ): Promise<ThreadsBlacklistPhraseView> {
    const all = await this.blacklistRepo.findAll();
    const phrase = all.find((p) => p.id === id);
    if (!phrase) {
      throw new NotFoundException(`Blacklist phrase ${id} not found`);
    }
    return ThreadsBlacklistController.toView(phrase);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async create(
    @Body() dto: CreateThreadsBlacklistDto,
  ): Promise<ThreadsBlacklistPhraseView> {
    await this.phraseRegistry.throwIfDuplicate(
      'blacklist',
      dto.phrase,
      dto.caseSensitive ?? false,
      dto.matchMode ?? 'exact',
      dto.andGroupId ?? null,
    );

    const phrase = ThreadsBlacklistPhrase.create({
      phrase: dto.phrase,
      caseSensitive: dto.caseSensitive,
      matchMode: dto.matchMode ?? 'exact',
      enabled: dto.enabled,
      sourceChannelIds: dto.sourceChannelIds ?? [],
      andGroupId: dto.andGroupId ?? null,
      requireMedia: dto.requireMedia ?? false,
    });
    await this.blacklistRepo.save(phrase);
    return ThreadsBlacklistController.toView(phrase);
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  public async createBatch(
    @Body() dto: CreateThreadsBlacklistBatchDto,
  ): Promise<ReadonlyArray<ThreadsBlacklistPhraseView>> {
    const andGroupId = crypto.randomUUID();
    const results: ThreadsBlacklistPhraseView[] = [];

    for (const item of dto.phrases) {
      await this.phraseRegistry.throwIfDuplicate(
        'blacklist',
        item.phrase,
        item.caseSensitive ?? false,
        item.matchMode ?? 'exact',
        andGroupId,
      );

      const phrase = ThreadsBlacklistPhrase.create({
        phrase: item.phrase,
        caseSensitive: item.caseSensitive,
        matchMode: item.matchMode ?? 'exact',
        enabled: item.enabled,
        sourceChannelIds: item.sourceChannelIds ?? [],
        andGroupId,
        requireMedia: item.requireMedia ?? false,
      });
      await this.blacklistRepo.save(phrase);
      results.push(ThreadsBlacklistController.toView(phrase));
    }

    return results;
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateThreadsBlacklistDto,
  ): Promise<ThreadsBlacklistPhraseView> {
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

    // When phrase or andGroupId changes, check for duplicates (exclude self).
    if (dto.phrase !== undefined || dto.andGroupId !== undefined) {
      await this.phraseRegistry.throwIfDuplicate(
        'blacklist',
        nextPhrase,
        nextCaseSensitive,
        nextMatchMode,
        nextAndGroupId,
        id,
      );
    }

    const nextRequireMedia =
      dto.requireMedia !== undefined ? dto.requireMedia : existing.requireMedia;

    const updated = ThreadsBlacklistPhrase.reconstitute({
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
    return ThreadsBlacklistController.toView(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@Param('id') id: string): Promise<void> {
    await this.blacklistRepo.delete(id);
  }

  private static readonly toView = (
    phrase: ThreadsBlacklistPhrase,
  ): ThreadsBlacklistPhraseView => ({
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
