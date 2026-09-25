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
import { BlacklistPhraseRepository } from '../../application/ports/blacklist-phrase.repository';
import { PhraseRegistryService } from '../../application/services/phrase-registry.service';
import {
  BlacklistPhraseUseCases,
  toBlacklistPhraseView,
  type BlacklistPhraseView,
} from '../../application/use-cases/blacklist-phrase.use-cases';
import {
  CreateBlacklistBatchDto,
  CreateBlacklistPhraseDto,
  UpdateBlacklistPhraseDto,
} from '../input/blacklist.input';

/**
 * Blacklist-phrase CRUD (`/content-publisher/blacklist`).
 *
 * Same route shape as the keywords controller, opposite polarity:
 * matching rows block an otherwise matching message.
 */
@ApiTags('content-publisher-blacklist')
@Controller('content-publisher/blacklist')
export class BlacklistController {
  public constructor(
    private readonly blacklistRepo: BlacklistPhraseRepository,
    private readonly useCases: BlacklistPhraseUseCases,
    private readonly phraseRegistry: PhraseRegistryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all blacklist phrases' })
  @ApiResponse({ status: 200, description: 'All blacklist phrases' })
  public async list(): Promise<ReadonlyArray<BlacklistPhraseView>> {
    const all = await this.blacklistRepo.findAll();
    return all.map(toBlacklistPhraseView);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one blacklist phrase by id' })
  @ApiParam({ name: 'id', description: 'Blacklist phrase id (uuid)' })
  @ApiResponse({ status: 200, description: 'The blacklist phrase' })
  @ApiResponse({ status: 404, description: 'Unknown blacklist phrase id' })
  public async getOne(@Param('id') id: string): Promise<BlacklistPhraseView> {
    const all = await this.blacklistRepo.findAll();
    const phrase = all.find((p) => p.id === id);
    if (!phrase) {
      throw new NotFoundException(`Blacklist phrase ${id} not found`);
    }
    return toBlacklistPhraseView(phrase);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new blacklist phrase' })
  @ApiResponse({ status: 201, description: 'Blacklist phrase created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Duplicate phrase' })
  public async create(
    @Body() dto: CreateBlacklistPhraseDto,
  ): Promise<BlacklistPhraseView> {
    await this.phraseRegistry.throwIfDuplicate(
      'blacklist',
      dto.phrase,
      dto.caseSensitive ?? false,
      dto.matchMode ?? 'exact',
      dto.andGroupId ?? null,
    );
    const created = await this.useCases.create(dto);
    return toBlacklistPhraseView(created);
  }

  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an AND-group of blacklist phrases in one call',
  })
  @ApiResponse({ status: 201, description: 'Blacklist phrases created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  public async createBatch(
    @Body() dto: CreateBlacklistBatchDto,
  ): Promise<ReadonlyArray<BlacklistPhraseView>> {
    const created = await this.useCases.createCompoundGroup(dto.phrases);
    return created.map(toBlacklistPhraseView);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update a blacklist phrase' })
  @ApiParam({ name: 'id', description: 'Blacklist phrase id (uuid)' })
  @ApiResponse({ status: 200, description: 'Blacklist phrase updated' })
  @ApiResponse({ status: 404, description: 'Unknown blacklist phrase id' })
  @ApiResponse({ status: 409, description: 'Duplicate phrase' })
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateBlacklistPhraseDto,
  ): Promise<BlacklistPhraseView> {
    const all = await this.blacklistRepo.findAll();
    const existing = all.find((p) => p.id === id);
    if (!existing) {
      throw new NotFoundException(`Blacklist phrase ${id} not found`);
    }
    const nextPhrase = dto.phrase !== undefined ? dto.phrase : existing.phrase;
    const nextCaseSensitive = dto.caseSensitive ?? existing.caseSensitive;
    const nextMatchMode = dto.matchMode ?? existing.matchMode;
    const nextAndGroupId =
      dto.andGroupId !== undefined ? dto.andGroupId : existing.andGroupId;
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
    try {
      const updated = await this.useCases.update(id, dto);
      return toBlacklistPhraseView(updated);
    } catch {
      throw new NotFoundException(`Blacklist phrase ${id} not found`);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a blacklist phrase' })
  @ApiParam({ name: 'id', description: 'Blacklist phrase id (uuid)' })
  @ApiResponse({ status: 204, description: 'Blacklist phrase removed' })
  public async remove(@Param('id') id: string): Promise<void> {
    await this.useCases.remove(id);
  }
}
