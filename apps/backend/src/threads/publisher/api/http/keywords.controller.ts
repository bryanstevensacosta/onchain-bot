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
import { ThreadsKeywordRepository } from 'threads/publisher/application/ports/threads-keyword.repository';
import {
  ThreadsKeyword,
  type ThreadsMatchMode,
} from 'threads/publisher/domain/entities/threads-keyword.entity';
import { ThreadsPhraseRegistryService } from 'threads/publisher/application/services/threads-phrase-registry.service';

export interface ThreadsKeywordView {
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

interface CreateThreadsKeywordDto {
  phrase: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  sourceChannelIds?: string[];
  /**
   * Optional override binding to a `ThreadsPromptTemplate.id`. When
   * null (the default), the keyword falls back to the global default
   * template referenced by `ThreadsLlmConfig.defaultTemplateId` at
   * publish time.
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

interface UpdateThreadsKeywordDto {
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

interface CreateThreadsKeywordBatchDto {
  phrases: Array<{
    phrase: string;
    caseSensitive?: boolean;
    enabled?: boolean;
    sourceChannelIds?: string[];
    templateId?: string | null;
    requireMedia?: boolean;
    matchMode?: 'exact' | 'substring';
  }>;
}

/**
 * REST API for threads-publisher keywords.
 *
 * Threads-typed mirror of the crypto-news `KeywordsController`
 * (`telegram/crypto-news-publisher/api/http/keywords.controller.ts`).
 *
 * Endpoints (all under `/threads-publisher/keywords`):
 *  - GET    /          List all keywords
 *  - GET    /:id       Get one keyword
 *  - POST   /          Create a new keyword
 *  - POST   /batch     Create an AND-group of keywords in one call
 *  - PATCH  /:id       Update a keyword (partial — `templateId` may
 *                      be explicitly cleared with `null`)
 *  - DELETE /:id       Remove a keyword
 *
 * `templateId` is the single argument that wires the keyword to a
 * `ThreadsPromptTemplate`; the `ThreadsLlmConfigController` enforces
 * that `ThreadsPromptTemplate` rows referenced by any keyword (or the
 * global default) cannot be deleted.
 */
@Controller(['threads-publisher/keywords', 'feed-threads-publisher/keywords'])
export class ThreadsKeywordsController {
  public constructor(
    private readonly keywordRepo: ThreadsKeywordRepository,
    private readonly phraseRegistry: ThreadsPhraseRegistryService,
  ) {}

  @Get()
  public async list(): Promise<ReadonlyArray<ThreadsKeywordView>> {
    const all = await this.keywordRepo.findAll();
    return all.map(ThreadsKeywordsController.toView);
  }

  @Get(':id')
  public async getOne(@Param('id') id: string): Promise<ThreadsKeywordView> {
    const all = await this.keywordRepo.findAll();
    const kw = all.find((k) => k.id === id);
    if (!kw) {
      throw new NotFoundException(`Keyword ${id} not found`);
    }
    return ThreadsKeywordsController.toView(kw);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  public async create(
    @Body() dto: CreateThreadsKeywordDto,
  ): Promise<ThreadsKeywordView> {
    await this.phraseRegistry.throwIfDuplicate(
      'keyword',
      dto.phrase,
      dto.caseSensitive ?? false,
      dto.matchMode ?? 'exact',
      dto.andGroupId ?? null,
    );

    const keyword = ThreadsKeyword.create({
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
    return ThreadsKeywordsController.toView(keyword);
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  public async createBatch(
    @Body() dto: CreateThreadsKeywordBatchDto,
  ): Promise<ReadonlyArray<ThreadsKeywordView>> {
    const andGroupId = crypto.randomUUID();
    const results: ThreadsKeywordView[] = [];

    for (const item of dto.phrases) {
      await this.phraseRegistry.throwIfDuplicate(
        'keyword',
        item.phrase,
        item.caseSensitive ?? false,
        item.matchMode ?? 'exact',
        andGroupId,
      );

      const keyword = ThreadsKeyword.create({
        phrase: item.phrase,
        caseSensitive: item.caseSensitive,
        enabled: item.enabled,
        sourceChannelIds: item.sourceChannelIds ?? [],
        templateId: item.templateId ?? null,
        andGroupId,
        requireMedia: item.requireMedia ?? false,
        matchMode: item.matchMode,
      });
      await this.keywordRepo.save(keyword);
      results.push(ThreadsKeywordsController.toView(keyword));
    }

    return results;
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateThreadsKeywordDto,
  ): Promise<ThreadsKeywordView> {
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
    const nextMatchMode: ThreadsMatchMode =
      dto.matchMode !== undefined ? dto.matchMode : existing.matchMode;
    const nextAndGroupId =
      dto.andGroupId !== undefined ? dto.andGroupId : existing.andGroupId;

    // When phrase/andGroupId changes, check for duplicates (exclude self).
    if (dto.phrase !== undefined || dto.andGroupId !== undefined) {
      await this.phraseRegistry.throwIfDuplicate(
        'keyword',
        nextPhrase,
        nextCaseSensitive,
        nextMatchMode,
        nextAndGroupId,
        id,
      );
    }
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
    const nextRequireMedia =
      dto.requireMedia !== undefined ? dto.requireMedia : existing.requireMedia;

    const updated = ThreadsKeyword.reconstitute({
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
    return ThreadsKeywordsController.toView(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(@Param('id') id: string): Promise<void> {
    await this.keywordRepo.delete(id);
  }

  private static readonly toView = (
    keyword: ThreadsKeyword,
  ): ThreadsKeywordView => ({
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
