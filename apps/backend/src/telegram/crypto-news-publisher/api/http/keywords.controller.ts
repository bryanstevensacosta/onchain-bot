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
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

export interface KeywordView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly enabled: boolean;
  readonly templateId: string | null;
  readonly createdAt: string;
}

interface CreateKeywordDto {
  phrase: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  /**
   * Optional override binding to a `PromptTemplate.id`. When null
   * (the default), the keyword falls back to the global default
   * template referenced by `LlmConfig.defaultTemplateId` at publish
   * time.
   */
  templateId?: string | null;
}

interface UpdateKeywordDto {
  phrase?: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  /**
   * Partial template binding update:
   *  - `undefined` → leave existing binding untouched
   *  - `null`      → clear the binding (fall back to default)
   *  - `"<uuid>"`  → bind to that template
   */
  templateId?: string | null;
}

/**
 * REST API for crypto-news-publisher keywords.
 *
 * Endpoints (all under `/crypto-news-publisher/keywords`):
 *  - GET    /          List all keywords
 *  - GET    /:id       Get one keyword
 *  - POST   /          Create a new keyword
 *  - PATCH  /:id       Update a keyword (partial — `templateId` may
 *                      be explicitly cleared with `null`)
 *  - DELETE /:id       Remove a keyword
 *
 * `templateId` is the single argument that wires the keyword to a
 * `PromptTemplate`; the `LlmConfigController` enforces that
 * `PromptTemplate` rows referenced by any keyword (or the global
 * default) cannot be deleted.
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
  public async getOne(@Param('id') id: string): Promise<KeywordView> {
    const all = await this.keywordRepo.findAll();
    const kw = all.find((k) => k.id === id);
    if (!kw) {
      throw new NotFoundException(`Keyword ${id} not found`);
    }
    return KeywordsController.toView(kw);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async create(@Body() dto: CreateKeywordDto): Promise<KeywordView> {
    const keyword = Keyword.create({
      phrase: dto.phrase,
      caseSensitive: dto.caseSensitive,
      enabled: dto.enabled,
      templateId: dto.templateId ?? null,
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
      throw new NotFoundException(`Keyword ${id} not found`);
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
    const nextTemplateId =
      dto.templateId !== undefined ? dto.templateId : existing.templateId;

    const updated = Keyword.reconstitute({
      id: existing.id,
      phrase: nextPhrase,
      caseSensitive: nextCaseSensitive,
      templateId: nextTemplateId,
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
    templateId: keyword.templateId,
    createdAt: keyword.createdAt.toISOString(),
  });
}
