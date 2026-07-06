import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

export interface KeywordView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly enabled: boolean;
  readonly createdAt: string;
}

interface CreateKeywordDto {
  phrase: string;
  caseSensitive?: boolean;
  enabled?: boolean;
}

interface UpdateKeywordDto {
  phrase?: string;
  caseSensitive?: boolean;
  enabled?: boolean;
}

/**
 * REST API for crypto-news-publisher keywords.
 *
 * Endpoints (all under `/crypto-news-publisher/keywords`):
 *  - GET    /          List all keywords
 *  - GET    /:id       Get one keyword
 *  - POST   /          Create a new keyword
 *  - PATCH  /:id       Update a keyword
 *  - DELETE /:id       Remove a keyword
 */
@Controller('crypto-news-publisher/keywords')
export class KeywordsController {
  public constructor(private readonly keywordRepo: KeywordRepository) {}

  @Get()
  public async list(): Promise<ReadonlyArray<KeywordView>> {
    const all = await this.keywordRepo.findAll();
    return all.map(KeywordsController.toView);
  }

  @Get(':id')
  public async getOne(@Param('id') id: string): Promise<KeywordView | null> {
    const all = await this.keywordRepo.findAll();
    const kw = all.find((k) => k.id === id);
    return kw ? KeywordsController.toView(kw) : null;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async create(@Body() dto: CreateKeywordDto): Promise<KeywordView> {
    const keyword = Keyword.create({
      phrase: dto.phrase,
      caseSensitive: dto.caseSensitive,
      enabled: dto.enabled,
    });
    await this.keywordRepo.save(keyword);
    return KeywordsController.toView(keyword);
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateKeywordDto,
  ): Promise<KeywordView> {
    const all = await this.keywordRepo.findAll();
    const existing = all.find((k) => k.id === id);
    if (!existing) {
      throw new Error(`Keyword not found: ${id}`);
    }

    const nextPhrase = dto.phrase !== undefined ? dto.phrase : existing.phrase;
    const nextCaseSensitive =
      dto.caseSensitive !== undefined
        ? dto.caseSensitive
        : existing.caseSensitive;
    let nextEnabled = existing.enabled;
    if (dto.enabled === true) {
      nextEnabled = true;
    } else if (dto.enabled === false) {
      nextEnabled = false;
    }

    const updated = Keyword.reconstitute({
      id: existing.id,
      phrase: nextPhrase,
      caseSensitive: nextCaseSensitive,
      enabled: nextEnabled,
      createdAt: existing.createdAt,
    });

    await this.keywordRepo.save(updated);
    return KeywordsController.toView(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@Param('id') id: string): Promise<void> {
    await this.keywordRepo.delete(id);
  }

  private static readonly toView = (keyword: Keyword): KeywordView => ({
    id: keyword.id,
    phrase: keyword.phrase,
    caseSensitive: keyword.caseSensitive,
    enabled: keyword.enabled,
    createdAt: keyword.createdAt.toISOString(),
  });
}
