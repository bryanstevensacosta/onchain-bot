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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { KeywordRepository } from '../../application/ports/keyword.repository';
import { PhraseRegistryService } from '../../application/services/phrase-registry.service';
import {
  KeywordUseCases,
  toKeywordView,
  type KeywordView,
} from '../../application/use-cases/keyword.use-cases';
import {
  CreateKeywordBatchDto,
  CreateKeywordDto,
  UpdateKeywordDto,
} from '../input/keyword.input';

/**
 * Allowed-keyword CRUD (`/content-publisher/keywords`).
 *
 * GET / · GET /:id · POST / · POST /batch (one AND-group) · PATCH /:id ·
 * DELETE /:id. Duplicate writes are rejected with 409 via
 * PhraseRegistryService (intra + cross-table). `templateId` follows the
 * backend partial-update contract (undefined = keep, null = clear).
 */
@ApiTags('content-publisher-keywords')
@Controller('content-publisher/keywords')
export class KeywordsController {
  public constructor(
    private readonly keywordRepo: KeywordRepository,
    private readonly useCases: KeywordUseCases,
    private readonly phraseRegistry: PhraseRegistryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all allowed keywords' })
  @ApiResponse({ status: 200, description: 'All keywords' })
  public async list(): Promise<ReadonlyArray<KeywordView>> {
    const all = await this.keywordRepo.findAll();
    return all.map(toKeywordView);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one keyword by id' })
  @ApiParam({ name: 'id', description: 'Keyword id (uuid)' })
  @ApiResponse({ status: 200, description: 'The keyword' })
  @ApiResponse({ status: 404, description: 'Unknown keyword id' })
  public async getOne(@Param('id') id: string): Promise<KeywordView> {
    const all = await this.keywordRepo.findAll();
    const kw = all.find((k) => k.id === id);
    if (!kw) {
      throw new NotFoundException(`Keyword ${id} not found`);
    }
    return toKeywordView(kw);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new allowed keyword' })
  @ApiResponse({ status: 201, description: 'Keyword created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Duplicate phrase' })
  public async create(@Body() dto: CreateKeywordDto): Promise<KeywordView> {
    await this.phraseRegistry.throwIfDuplicate(
      'keyword',
      dto.phrase,
      dto.caseSensitive ?? false,
      dto.matchMode ?? 'exact',
      dto.andGroupId ?? null,
    );
    const created = await this.useCases.create(dto);
    return toKeywordView(created);
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an AND-group of keywords in one call' })
  @ApiResponse({ status: 201, description: 'Keywords created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  public async createBatch(
    @Body() dto: CreateKeywordBatchDto,
  ): Promise<ReadonlyArray<KeywordView>> {
    const created = await this.useCases.createCompoundGroup(dto.phrases);
    return created.map(toKeywordView);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a keyword' })
  @ApiParam({ name: 'id', description: 'Keyword id (uuid)' })
  @ApiResponse({ status: 200, description: 'Keyword updated' })
  @ApiResponse({ status: 404, description: 'Unknown keyword id' })
  @ApiResponse({ status: 409, description: 'Duplicate phrase' })
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
    const nextCaseSensitive = dto.caseSensitive ?? existing.caseSensitive;
    const nextMatchMode = dto.matchMode ?? existing.matchMode;
    const nextAndGroupId =
      dto.andGroupId !== undefined ? dto.andGroupId : existing.andGroupId;
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
    try {
      const updated = await this.useCases.update(id, dto);
      return toKeywordView(updated);
    } catch {
      throw new NotFoundException(`Keyword ${id} not found`);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a keyword' })
  @ApiParam({ name: 'id', description: 'Keyword id (uuid)' })
  @ApiResponse({ status: 204, description: 'Keyword removed' })
  public async remove(@Param('id') id: string): Promise<void> {
    await this.useCases.remove(id);
  }
}
