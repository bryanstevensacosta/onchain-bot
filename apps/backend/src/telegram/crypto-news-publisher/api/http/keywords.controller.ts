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
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

export interface KeywordView {
  readonly id: string;
  readonly phrase: string;
  readonly caseSensitive: boolean;
  readonly sourceChannelIds: string[];
  readonly enabled: boolean;
  readonly andGroupId: string | null;
  readonly requireMedia: boolean;
  readonly templateId: string | null;
  readonly matchMode: 'exact' | 'substring';
  readonly createdAt: string;
}

interface CreateKeywordDto {
  phrase: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
  /**
   * Optional override binding to a `PromptTemplate.id`. When null
   * (the default), the keyword falls back to the global default
   * template referenced by `LlmConfig.defaultTemplateId` at publish
   * time.
   */
  templateId?: string | null;
  /**
   * Compound keyword group ID. When non-null, this keyword is part of
   * an AND-group: messages must match ALL keywords in the group to
   * trigger a match.
   */
  andGroupId?: string | null;
  /**
   * When true, only messages that have at least one media item are
   * enqueued; otherwise the match is dropped (no PENDING entry).
   */
  requireMedia?: boolean;
  /**
   * Matching mode: `'exact'` (word-boundary regex, default for new
   * keywords) or `'substring'` (simple `includes()`).
   */
  matchMode?: 'exact' | 'substring';
}

interface UpdateKeywordDto {
  phrase?: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
  /**
   * Partial template binding update:
   *  - `undefined` → leave existing binding untouched
   *  - `null`      → clear the binding (fall back to default)
   *  - `"<uuid>"`  → bind to that template
   */
  templateId?: string | null;
  /**
   * Compound keyword group ID. When non-null, this keyword is part of
   * an AND-group: messages must match ALL keywords in the group to
   * trigger a match.
   */
  andGroupId?: string | null;
  requireMedia?: boolean;
  /**
   * Matching mode: `'exact'` (word-boundary regex) or
   * `'substring'` (simple `includes()`).
   */
  matchMode?: 'exact' | 'substring';
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
    const trimmed = dto.phrase.trim();
    const existing = await this.keywordRepo.findAll();
    const dup = existing.find(
      (k) =>
        k.phrase.toLowerCase() === trimmed.toLowerCase() &&
        k.andGroupId === (dto.andGroupId ?? null),
    );
    if (dup) {
      throw new ConflictException(`Keyword "${dto.phrase}" already exists`);
    }

    const keyword = Keyword.create({
      phrase: dto.phrase,
      caseSensitive: dto.caseSensitive,
      enabled: dto.enabled,
      sourceChannelIds: dto.sourceChannelIds ?? [],
      templateId: dto.templateId ?? null,
      andGroupId: dto.andGroupId ?? null,
      requireMedia: dto.requireMedia ?? false,
      matchMode: dto.matchMode,
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
    const nextSourceChannelIds =
      dto.sourceChannelIds !== undefined
        ? dto.sourceChannelIds
        : existing.sourceChannelIds;
    const nextTemplateId =
      dto.templateId !== undefined ? dto.templateId : existing.templateId;
    const nextAndGroupId =
      dto.andGroupId !== undefined ? dto.andGroupId : existing.andGroupId;
    const nextRequireMedia =
      dto.requireMedia !== undefined ? dto.requireMedia : existing.requireMedia;
    const nextMatchMode =
      dto.matchMode !== undefined ? dto.matchMode : existing.matchMode;

    const updated = Keyword.reconstitute({
      id: existing.id,
      phrase: nextPhrase,
      caseSensitive: nextCaseSensitive,
      sourceChannelIds: nextSourceChannelIds,
      templateId: nextTemplateId,
      enabled: nextEnabled,
      andGroupId: nextAndGroupId,
      requireMedia: nextRequireMedia,
      matchMode: nextMatchMode,
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
    sourceChannelIds: keyword.sourceChannelIds,
    enabled: keyword.enabled,
    andGroupId: keyword.andGroupId,
    requireMedia: keyword.requireMedia,
    templateId: keyword.templateId,
    matchMode: keyword.matchMode,
    createdAt: keyword.createdAt.toISOString(),
  });
}
